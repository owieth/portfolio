/**
 * Step thirteen: get the OSM route relations the geometry is drawn from.
 *
 * Neither the official feed nor the mirror ships a `shapes.txt`, so every line's
 * shape comes from OpenStreetMap, through the public Overpass API: every
 * `route=train` and `route=funicular` relation with a member in Switzerland,
 * with its members' coordinates inline.
 *
 * Overpass is a shared, rationed service, and the train query runs for minutes.
 * So a response is fetched once and kept: the raw body goes to
 * `data/raw/overpass/<key>.json`, a record of the query and the OSM timestamp
 * goes next to it, and a second run reads both back without a single request.
 * Refreshing the geometry is deleting that directory.
 *
 * A 200 is not a success on its own. Overpass reports a query that ran out of
 * time or memory in a `remark` on an otherwise ordinary 200, with whatever it had
 * found so far in `elements`, and caching that would silently drop lines from
 * the map for a year. Such a response is discarded and retried like a 504.
 */

import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { Readable } from 'node:stream';
import type { ReadableStream } from 'node:stream/web';

import { downloadArchive } from './fetch/archive.ts';
import { ATTRIBUTION_FILE, OSM_ATTRIBUTION } from './overpass/attribution.ts';
import type { Attribution } from './overpass/attribution.ts';
import {
  OVERPASS_DIR,
  isCacheHit,
  readRecord,
  recordPath,
  responsePath,
  writeRecord,
} from './overpass/cache.ts';
import type { OverpassRecord } from './overpass/cache.ts';
import { QUERY_TIMEOUT_S, ROUTE_TYPES, buildQuery, queryKey } from './overpass/query.ts';
import type { RouteType } from './overpass/query.ts';
import {
  RetryableError,
  isRetryableStatus,
  parseRetryAfter,
  sleep as wait,
  withRetry,
} from './overpass/retry.ts';
import type { Sleep } from './overpass/retry.ts';
import { RAIL_DIR } from './paths.ts';

export const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';

/**
 * The operators ask heavy users to say who they are, so a query that misbehaves
 * can be traced to someone rather than blocked outright.
 */
const USER_AGENT = 'owieth-portfolio-rail/1.0 (+https://github.com/owieth/portfolio)';

/** A minute longer than the server will run the query, so its own error arrives first. */
const CLIENT_TIMEOUT_MS = (QUERY_TIMEOUT_S + 60) * 1000;

export interface OsmPoint {
  lat: number;
  lon: number;
}

export interface OsmMember {
  type: 'node' | 'way' | 'relation';
  ref: number;
  role: string;
  /** A node member's position. */
  lat?: number;
  lon?: number;
  /** A way member's coordinates, in the way's own order. */
  geometry?: OsmPoint[];
}

export interface OsmRelation {
  id: number;
  route: RouteType;
  tags: Record<string, string>;
  members: OsmMember[];
}

export interface OsmRelations {
  /** Train and funicular relations together, ordered by id. */
  relations: OsmRelation[];
  attribution: Attribution;
  /** HTTP requests this run made, retries included. Zero on a warm cache. */
  requests: number;
}

export interface OverpassDeps {
  dir?: string;
  endpoint?: string;
  fetch?: typeof fetch;
  sleep?: Sleep;
  now?: () => Date;
}

interface OverpassResponse {
  osm3s?: { timestamp_osm_base?: string };
  remark?: string;
  elements?: { type?: string; id?: number; tags?: Record<string, string>; members?: OsmMember[] }[];
}

interface Parsed {
  timestampOsmBase: string;
  relations: OsmRelation[];
}

type Log = (message: string) => void;

function here(path: string): string {
  return relative(RAIL_DIR, path);
}

function megabytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

function count(value: number): string {
  return value.toLocaleString('en-US');
}

/**
 * Throws a `RetryableError` for anything a second attempt could fix — an
 * unparseable body is almost always one the connection cut short — and a plain
 * `Error` for a shape that says the API itself has changed.
 */
export function parseResponse(raw: string, route: RouteType): Parsed {
  let response: OverpassResponse;

  try {
    response = JSON.parse(raw) as OverpassResponse;
  } catch (error) {
    throw new RetryableError('the response is not valid JSON', null, error);
  }

  if (response.remark?.includes('runtime error')) {
    throw new RetryableError(`Overpass gave up part way: ${response.remark.trim()}`);
  }

  const timestampOsmBase = response.osm3s?.timestamp_osm_base;

  if (typeof timestampOsmBase !== 'string' || !Array.isArray(response.elements)) {
    throw new Error(
      'the response has no osm3s.timestamp_osm_base or elements; the Overpass reader needs revisiting',
    );
  }

  const relations = response.elements
    .filter(element => element.type === 'relation' && typeof element.id === 'number')
    .map(element => ({
      id: element.id as number,
      route,
      tags: element.tags ?? {},
      members: element.members ?? [],
    }));

  return { timestampOsmBase, relations };
}

async function fileBytes(path: string): Promise<number | null> {
  const found = await stat(path).catch(() => null);
  return found?.isFile() ? found.size : null;
}

/**
 * One request, streamed to disk and checked. Everything after the status line
 * happens on the file rather than in memory, because the train response runs to
 * tens of megabytes and the archive writer already knows how to land a body
 * atomically.
 */
async function request(
  query: string,
  path: string,
  route: RouteType,
  endpoint: string,
  fetchFn: typeof fetch,
  now: () => Date,
): Promise<{ parsed: Parsed; bytes: number; sha256: string }> {
  let response: Response;

  try {
    response = await fetchFn(endpoint, {
      method: 'POST',
      headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
      body: new URLSearchParams({ data: query }),
      signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
    });
  } catch (error) {
    throw new RetryableError('the request failed before an answer arrived', null, error);
  }

  if (isRetryableStatus(response.status)) {
    await response.body?.cancel();
    throw new RetryableError(
      `${endpoint} answered ${response.status} ${response.statusText}`,
      parseRetryAfter(response.headers.get('retry-after'), now()),
    );
  }

  if (!response.ok || response.body === null) {
    // Overpass explains a rejected query in the body, as HTML. The first line of
    // text is the part worth reading.
    const detail = (await response.text().catch(() => ''))
      .replaceAll(/<[^>]+>/g, ' ')
      .replaceAll(/\s+/g, ' ')
      .trim()
      .slice(0, 300);

    throw new Error(
      `${endpoint} answered ${response.status} ${response.statusText}${detail ? `: ${detail}` : ''}`,
    );
  }

  let stored: { bytes: number; sha256: string };

  try {
    stored = await downloadArchive(
      Readable.fromWeb(response.body as ReadableStream),
      path,
    );
  } catch (error) {
    throw new RetryableError('the response was cut off', null, error);
  }

  try {
    return { parsed: parseResponse(await readFile(path, 'utf8'), route), ...stored };
  } catch (error) {
    // Never left behind: without a record it would not be read back, but it
    // would sit there looking like a cached answer to anyone listing the files.
    await rm(path, { force: true });
    throw error;
  }
}

async function loadRoute(
  route: RouteType,
  log: Log,
  deps: Required<OverpassDeps>,
  counter: { requests: number },
): Promise<Parsed> {
  const query = buildQuery(route);
  const key = queryKey(query);
  const path = responsePath(deps.dir, key);
  const cached = await readRecord(deps.dir, key);

  if (isCacheHit(cached, query, await fileBytes(path))) {
    const parsed = parseResponse(await readFile(path, 'utf8'), route);

    log(
      `cache hit ${route} relations ${here(path)} — OSM as of ${cached.timestampOsmBase}, fetched ${cached.fetchedAt}`,
    );

    return parsed;
  }

  // A record that outlived its response, or will not match the next one, goes
  // first: from here until the new record is written, nothing on disk claims to
  // be a complete answer to this query.
  await rm(recordPath(deps.dir, key), { force: true });

  log(`asking Overpass for every route=${route} relation in Switzerland`);

  const startedAt = performance.now();
  const fetched = await withRetry(
    () => {
      counter.requests++;
      return request(query, path, route, deps.endpoint, deps.fetch, deps.now);
    },
    { label: `overpass ${route}`, log, sleep: deps.sleep },
  );

  const record: OverpassRecord = await writeRecord(deps.dir, {
    key,
    query,
    endpoint: deps.endpoint,
    timestampOsmBase: fetched.parsed.timestampOsmBase,
    bytes: fetched.bytes,
    sha256: fetched.sha256,
    fetchedAt: deps.now().toISOString(),
  });

  log(
    `wrote ${here(path)} — ${count(fetched.parsed.relations.length)} ${route} relations, ${megabytes(record.bytes)}, OSM as of ${record.timestampOsmBase}, ${((performance.now() - startedAt) / 1000).toFixed(1)} s`,
  );

  return fetched.parsed;
}

export async function fetchOsmRelations(
  log: Log,
  deps: OverpassDeps = {},
): Promise<OsmRelations> {
  const resolved: Required<OverpassDeps> = {
    dir: deps.dir ?? OVERPASS_DIR,
    endpoint: deps.endpoint ?? OVERPASS_ENDPOINT,
    fetch: deps.fetch ?? globalThis.fetch,
    sleep: deps.sleep ?? wait,
    now: deps.now ?? (() => new Date()),
  };
  const counter = { requests: 0 };

  await mkdir(resolved.dir, { recursive: true });

  const loaded: Parsed[] = [];

  for (const route of ROUTE_TYPES) {
    // Sequential on purpose: the public instance allows a client about two slots,
    // and the train query alone can hold one for minutes.
    // react-doctor-disable-next-line react-doctor/async-await-in-loop
    loaded.push(await loadRoute(route, log, resolved, counter));
  }

  const attribution: Attribution = {
    ...OSM_ATTRIBUTION,
    osmBase: Object.fromEntries(
      ROUTE_TYPES.map((route, index) => [route, loaded[index].timestampOsmBase]),
    ),
  };

  // Next to the responses it licenses, so a copy of the directory carries it.
  await writeFile(
    join(resolved.dir, ATTRIBUTION_FILE),
    `${JSON.stringify(attribution, null, 2)}\n`,
  );

  const relations = loaded.flatMap(parsed => parsed.relations).sort((a, b) => a.id - b.id);

  log(
    `${count(relations.length)} OSM route relations ready, ${ROUTE_TYPES.map((route, index) => `${count(loaded[index].relations.length)} ${route}`).join(' and ')}, after ${count(counter.requests)} Overpass request${counter.requests === 1 ? '' : 's'}; geometry is ${attribution.text}, ${attribution.license}`,
  );

  return { relations, attribution, requests: counter.requests };
}
