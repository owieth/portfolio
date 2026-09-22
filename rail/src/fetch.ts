/**
 * Step one: get the Swiss GTFS feed onto disk, and record exactly which
 * publication it was.
 *
 * Two things make this more than a download. The zip URL changes with every
 * regeneration, so it has to be resolved at runtime rather than hardcoded. And
 * the archive is 256 MB, so a second run must cost nothing — otherwise every
 * later step is unaffordable to iterate on.
 *
 * The official source and the mirror are never mixed automatically. geOps
 * re-derives GTFS from the same publication with its own ids, so silently
 * switching would rewrite the committed artifacts and the December diff would
 * show a wall of changes that look like timetable changes and are not. A failure
 * on the official source names `--source geops` and stops.
 */

import { mkdir, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { Readable } from 'node:stream';
import type { ReadableStream } from 'node:stream/web';

import { RAIL_DIR, RAW_DIR } from './paths.ts';
import { downloadArchive } from './fetch/archive.ts';
import { parseCatalogue } from './fetch/dcat.ts';
import type { Distribution } from './fetch/dcat.ts';
import { extractArchive } from './fetch/extract.ts';
import type { Entry } from './fetch/extract.ts';
import type { FetchOptions } from './fetch/options.ts';
import {
  archivePath,
  assertSafeFeedId,
  decideCache,
  geopsFeedId,
  gtfsPath,
  officialFeedId,
  readRecord,
  touchRecord,
  withoutQuery,
  writeRecord,
} from './fetch/record.ts';
import type { CacheState, FeedRecord } from './fetch/record.ts';

const PORTAL = 'https://data.opentransportdata.swiss';
const GEOPS_VARIANT = 'complete';
const GEOPS_URL = `https://gtfs.geops.ch/dl/gtfs_${GEOPS_VARIANT}.zip`;

/** The catalogue is 300 KB and should never hang; the archive legitimately takes minutes. */
const CATALOGUE_TIMEOUT_MS = 30_000;

const RETRY_DELAY_MS = 2_000;

export interface FetchedFeed {
  id: string;
  dir: string;
  gtfsDir: string;
  record: FeedRecord;
  cached: boolean;
}

type Log = (message: string) => void;

function megabytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

function here(path: string): string {
  return relative(RAIL_DIR, path);
}

/** A 5xx or a dropped connection is worth one retry; a 4xx never is. */
async function fetchOnce(
  url: string,
  headers: Record<string, string>,
  signal?: AbortSignal,
): Promise<Response> {
  const response = await fetch(url, { headers, signal });

  if (response.status >= 500) {
    throw new Error(`${url} answered ${response.status} ${response.statusText}`);
  }

  return response;
}

async function fetchWithRetry(
  url: string,
  headers: Record<string, string> = {},
  signal?: AbortSignal,
): Promise<Response> {
  try {
    return await fetchOnce(url, headers, signal);
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }

    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    return fetchOnce(url, headers, signal);
  }
}

async function readCacheState(dir: string): Promise<CacheState> {
  const [archive, gtfs] = await Promise.all([
    stat(archivePath(dir)).catch(() => null),
    stat(gtfsPath(dir)).catch(() => null),
  ]);

  return {
    archiveBytes: archive?.isFile() ? archive.size : null,
    gtfsPresent: gtfs?.isDirectory() ?? false,
  };
}

/**
 * Streams the body into `<dir>/gtfs.zip`, then unpacks it. The declared size is
 * checked where the publisher gives one — `dcat:byteSize` is absent on some
 * distributions, and a short body that terminates cleanly would otherwise be
 * committed as if it were whole.
 */
async function store(
  dir: string,
  response: Response,
  declaredBytes: number | null,
  log: Log,
): Promise<{ bytes: number; sha256: string; entries: Entry[] }> {
  if (response.body === null) {
    throw new Error(`${response.url} returned no body`);
  }

  const expected =
    declaredBytes ?? (Number(response.headers.get('content-length')) || null);

  if (expected !== null) {
    log(`downloading ${megabytes(expected)} — this takes minutes on a home connection`);
  }

  await mkdir(dir, { recursive: true });

  const body = Readable.fromWeb(response.body as ReadableStream);
  const { bytes, sha256 } = await downloadArchive(body, archivePath(dir));

  if (expected !== null && bytes !== expected) {
    throw new Error(
      `truncated transfer: expected ${expected} bytes, wrote ${bytes}; delete ${here(dir)} and rerun`,
    );
  }

  log(`wrote ${here(archivePath(dir))} — ${megabytes(bytes)}, sha256 ${sha256.slice(0, 12)}…`);

  const entries = await extractArchive(archivePath(dir), gtfsPath(dir));
  log(`extracted ${entries.length} members into ${here(gtfsPath(dir))}`);

  await reportStaleFeeds(dir, log);

  return { bytes, sha256, entries };
}

/**
 * Every feed kept costs a quarter of a gigabyte plus its extraction, and a year
 * of refreshes adds up fast. Reported rather than deleted: throwing away someone
 * else's download is not a decision this pipeline gets to make on its own.
 */
async function reportStaleFeeds(current: string, log: Log): Promise<void> {
  const names = await readdir(RAW_DIR).catch(() => []);

  const archives = await Promise.all(
    names
      .map(name => join(RAW_DIR, name))
      .filter(dir => dir !== current)
      .map(dir => stat(archivePath(dir)).catch(() => null)),
  );

  const stale = archives.filter(archive => archive?.isFile() ?? false);

  if (stale.length === 0) {
    return;
  }

  const count = stale.length;
  const bytes = stale.reduce((total, archive) => total + (archive?.size ?? 0), 0);

  log(
    `data/raw holds ${count} older feed${count === 1 ? '' : 's'}` +
      ` (${megabytes(bytes)} of archives); delete them when you are done`,
  );
}

async function fetchOfficial(
  options: FetchOptions,
  log: Log,
  now: Date,
): Promise<FetchedFeed> {
  const { dataset } = options;

  if (dataset === null) {
    throw new Error('the official source needs a timetable year');
  }

  const page = `${PORTAL}/en/dataset/${dataset}`;

  // The .jsonld rendering rather than /api/3/action/package_show, which answers
  // 403 from nginx to every unauthenticated client. It 308s to /dataset_series/,
  // so the redirect must be followed — never `redirect: 'error'` here.
  const catalogUrl = `${page}.jsonld`;

  log(`resolving ${dataset} through the DCAT catalogue`);

  const response = await fetchWithRetry(
    catalogUrl,
    { accept: 'application/ld+json' },
    AbortSignal.timeout(CATALOGUE_TIMEOUT_MS),
  );

  if (!response.ok) {
    throw new Error(
      `${catalogUrl} answered ${response.status}; no such timetable year, or the portal is down — rerun with --source geops to use the mirror`,
    );
  }

  const publication = parseCatalogue(await response.json(), catalogUrl);
  const newest: Distribution = publication.newest;
  const feedId = officialFeedId(newest.feedYear, newest.feedDate);
  const dir = join(RAW_DIR, feedId);

  log(
    `newest publication ${newest.filename}, issued ${newest.issued.slice(0, 10)}` +
      (newest.declaredBytes === null ? '' : `, ${megabytes(newest.declaredBytes)}`),
  );

  const cached = await readRecord(dir);
  const decision = decideCache(cached, newest.resourceId, await readCacheState(dir));

  if (decision === 'hit' && cached !== null) {
    log(`cache hit ${feedId} — downloaded ${cached.fetchedAt}, nothing to do`);
    return {
      id: feedId,
      dir,
      gtfsDir: gtfsPath(dir),
      record: await touchRecord(dir, cached, now),
      cached: true,
    };
  }

  const download = await fetchWithRetry(newest.downloadUrl);

  if (!download.ok) {
    throw new Error(
      `${newest.downloadUrl} answered ${download.status}; retry, or rerun with --source geops to use the mirror`,
    );
  }

  const stored = await store(dir, download, newest.declaredBytes, log);
  const timestamp = now.toISOString();

  const record = await writeRecord(dir, {
    feedId,
    source: 'opentransportdata',
    timetableYear: options.year,
    dataset: {
      id: dataset,
      page,
      catalogUrl,
      uuid: publication.datasetUuid,
      validFrom: publication.validFrom,
      validTo: publication.validTo,
    },
    resource: {
      id: newest.resourceId,
      filename: newest.filename,
      issued: newest.issued,
      modified: newest.modified,
      declaredBytes: newest.declaredBytes,
      license: newest.license,
    },
    download: {
      url: newest.downloadUrl,
      finalUrl: withoutQuery(download.url),
      etag: download.headers.get('etag'),
      lastModified: download.headers.get('last-modified'),
      contentLength: Number(download.headers.get('content-length')) || null,
    },
    archive: { file: 'gtfs.zip', bytes: stored.bytes, sha256: stored.sha256 },
    entries: stored.entries,
    fetchedAt: timestamp,
    checkedAt: timestamp,
  });

  return { id: feedId, dir, gtfsDir: gtfsPath(dir), record, cached: false };
}

/**
 * The mirror serves one mutable, undated URL, so unlike the official source its
 * identity only arrives with the response. That inverts the order: ask the
 * server first with the validators from the newest cached record, and let a 304
 * be the cache hit.
 */
async function fetchGeops(log: Log, now: Date): Promise<FetchedFeed> {
  const previous = await newestGeopsRecord();
  const headers: Record<string, string> = {};

  if (previous !== null) {
    if (previous.record.download.etag !== null) {
      headers['if-none-match'] = previous.record.download.etag;
    }

    if (previous.record.download.lastModified !== null) {
      headers['if-modified-since'] = previous.record.download.lastModified;
    }
  }

  log(`asking ${GEOPS_URL} whether the cached feed is still current`);

  const response = await fetchWithRetry(GEOPS_URL, headers);

  if (response.status === 304 && previous !== null) {
    const state = await readCacheState(previous.dir);

    // A 304 only says the remote is unchanged. If the local copy went away since
    // the record was written, ask again without the validators.
    if (state.archiveBytes === previous.record.archive.bytes && state.gtfsPresent) {
      log(`cache hit ${previous.record.feedId} — the mirror answered 304 Not Modified`);
      return {
        id: previous.record.feedId,
        dir: previous.dir,
        gtfsDir: gtfsPath(previous.dir),
        record: await touchRecord(previous.dir, previous.record, now),
        cached: true,
      };
    }

    log(`the cached archive for ${previous.record.feedId} is gone; downloading again`);
    return fetchGeopsFresh(log, now);
  }

  if (!response.ok) {
    throw new Error(`${GEOPS_URL} answered ${response.status} ${response.statusText}`);
  }

  return storeGeops(response, log, now);
}

async function fetchGeopsFresh(log: Log, now: Date): Promise<FetchedFeed> {
  const response = await fetchWithRetry(GEOPS_URL);

  if (!response.ok) {
    throw new Error(`${GEOPS_URL} answered ${response.status} ${response.statusText}`);
  }

  return storeGeops(response, log, now);
}

async function storeGeops(
  response: Response,
  log: Log,
  now: Date,
): Promise<FetchedFeed> {
  const etag = response.headers.get('etag');
  const lastModified = response.headers.get('last-modified');

  if (etag === null && lastModified === null) {
    log('the mirror sent neither ETag nor Last-Modified; this feed cannot be cached');
  }

  const feedId = geopsFeedId(GEOPS_VARIANT, lastModified, etag, now);
  const dir = join(RAW_DIR, feedId);
  const stored = await store(dir, response, null, log);
  const timestamp = now.toISOString();

  const record = await writeRecord(dir, {
    feedId,
    source: 'geops',
    timetableYear: null,
    dataset: {
      id: null,
      page: 'https://gtfs.geops.ch/',
      catalogUrl: null,
      uuid: null,
      validFrom: null,
      validTo: null,
    },
    resource: {
      id: null,
      filename: `gtfs_${GEOPS_VARIANT}.zip`,
      issued: null,
      modified: lastModified,
      declaredBytes: null,
      license: null,
    },
    download: {
      url: GEOPS_URL,
      finalUrl: withoutQuery(response.url || GEOPS_URL),
      etag,
      lastModified,
      contentLength: Number(response.headers.get('content-length')) || null,
    },
    archive: { file: 'gtfs.zip', bytes: stored.bytes, sha256: stored.sha256 },
    entries: stored.entries,
    fetchedAt: timestamp,
    checkedAt: timestamp,
  });

  return { id: feedId, dir, gtfsDir: gtfsPath(dir), record, cached: false };
}

/**
 * The newest geops feed already on disk. A directory scan rather than a pointer
 * file, so there is one source of truth about what is cached and nothing to keep
 * in sync when a feed is deleted by hand.
 */
async function newestGeopsRecord(): Promise<{ dir: string; record: FeedRecord } | null> {
  const names = await readdir(RAW_DIR).catch(() => []);

  const dirs = names
    .filter(name => name.startsWith(`geops-${GEOPS_VARIANT}-`))
    .map(name => join(RAW_DIR, assertSafeFeedId(name)));

  const records = await Promise.all(dirs.map(dir => readRecord(dir)));

  const candidates = dirs
    .map((dir, index) => ({ dir, record: records[index] }))
    .filter(candidate => candidate.record?.source === 'geops')
    .map(candidate => ({ dir: candidate.dir, record: candidate.record as FeedRecord }));

  candidates.sort((a, b) => b.record.fetchedAt.localeCompare(a.record.fetchedAt));
  return candidates[0] ?? null;
}

export async function fetchFeed(
  options: FetchOptions,
  log: Log,
  now: Date = new Date(),
): Promise<FetchedFeed> {
  return options.source === 'geops'
    ? fetchGeops(log, now)
    : fetchOfficial(options, log, now);
}
