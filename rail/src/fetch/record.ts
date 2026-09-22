/**
 * `feed.json` — the provenance record written next to every cached feed, and the
 * cache decision read back out of it.
 *
 * The question it has to answer for a reader a year from now is: which exact
 * bytes produced this artifact, where did they come from, when, and can I still
 * prove it is them? Everything in `FeedRecord` is there to answer one clause of
 * that; nothing is there because it happened to be in the response.
 *
 * The record is written last, after the archive is renamed into place and the
 * extraction has completed. That ordering is the whole atomicity story: a
 * directory containing `feed.json` contains a complete, checksummed archive.
 */

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Source } from './options.ts';

export const ARCHIVE_FILE = 'gtfs.zip';
export const GTFS_DIR = 'gtfs';
export const RECORD_FILE = 'feed.json';

/** Bumped when a field changes meaning; an older record is re-fetched, not guessed at. */
const RECORD_VERSION = 1;

/**
 * A feed id becomes a directory name, and it is derived from remote input. This
 * is the line between a directory name and a path traversal.
 */
const SAFE_ID = /^[a-z0-9-]+$/;

export interface FeedRecord {
  version: number;
  feedId: string;
  source: Source;
  /** null for geops, which publishes one current feed and has no year selector. */
  timetableYear: number | null;
  dataset: {
    id: string | null;
    /** The human page, so a reader can go and look. */
    page: string;
    /** The DCAT URL actually requested, after the redirect. */
    catalogUrl: string | null;
    uuid: string | null;
    validFrom: string | null;
    validTo: string | null;
  };
  resource: {
    /** CKAN resource uuid — immutable per publication, and the cache key. */
    id: string | null;
    filename: string | null;
    /** Verbatim, including the +02:00: the offset is evidence of who published it. */
    issued: string | null;
    modified: string | null;
    declaredBytes: number | null;
    license: string | null;
  };
  download: {
    url: string;
    /** Where the redirect landed, query stripped — a presign is 60-second noise. */
    finalUrl: string;
    etag: string | null;
    lastModified: string | null;
    contentLength: number | null;
  };
  archive: {
    file: string;
    bytes: number;
    sha256: string;
  };
  /** Extraction manifest, so a later step can fail loudly on a missing member. */
  entries: { name: string; bytes: number }[];
  /** When these bytes arrived. */
  fetchedAt: string;
  /** When the cache last confirmed they are still current. */
  checkedAt: string;
}

export function assertSafeFeedId(feedId: string): string {
  if (!SAFE_ID.test(feedId)) {
    throw new Error(`refusing to use ${JSON.stringify(feedId)} as a directory name`);
  }

  return feedId;
}

/**
 * `otd-fp2026-20260919`. The year prefix is load-bearing rather than decorative:
 * the 2026 and 2027 series both publish an extract dated 20260919.
 */
export function officialFeedId(feedYear: number, feedDate: string): string {
  return assertSafeFeedId(`otd-fp${feedYear}-${feedDate}`);
}

/**
 * `geops-complete-20260921-4f2a1c9d`. The mirror publishes no version anywhere —
 * one mutable URL, rebuilt daily — so the id comes from the cache validators.
 * The Last-Modified date is the readable part; the ETag digest is the tiebreak
 * for two rebuilds in one day. Digested rather than used raw because an nginx
 * ETag is quoted and is not something to put in a path.
 */
export function geopsFeedId(
  variant: string,
  lastModified: string | null,
  etag: string | null,
  now: Date,
): string {
  const day = lastModified ? new Date(lastModified) : null;
  const stamp =
    day && !Number.isNaN(day.getTime())
      ? day.toISOString().slice(0, 10).replaceAll('-', '')
      : now.toISOString().slice(0, 19).replaceAll(/[-:T]/g, '');

  const suffix = etag
    ? `-${createHash('sha256').update(etag).digest('hex').slice(0, 8)}`
    : '';

  return assertSafeFeedId(`geops-${variant}-${stamp}${suffix}`);
}

/** Strips the presigned query, which expires in 60 seconds and is not reusable. */
export function withoutQuery(url: string): string {
  const parsed = new URL(url);
  parsed.search = '';
  return parsed.toString();
}

export function recordPath(dir: string): string {
  return join(dir, RECORD_FILE);
}

export function archivePath(dir: string): string {
  return join(dir, ARCHIVE_FILE);
}

export function gtfsPath(dir: string): string {
  return join(dir, GTFS_DIR);
}

/**
 * Returns null for every way a record can be unusable — absent, unreadable,
 * malformed, or written by an older version of this file. The caller treats all
 * four the same way, by downloading again.
 */
export async function readRecord(dir: string): Promise<FeedRecord | null> {
  let raw: string;

  try {
    raw = await readFile(recordPath(dir), 'utf8');
  } catch {
    return null;
  }

  try {
    const record = JSON.parse(raw) as FeedRecord;
    return record?.version === RECORD_VERSION ? record : null;
  } catch {
    return null;
  }
}

export async function writeRecord(
  dir: string,
  record: Omit<FeedRecord, 'version'>,
): Promise<FeedRecord> {
  const complete: FeedRecord = { version: RECORD_VERSION, ...record };
  await writeFile(recordPath(dir), `${JSON.stringify(complete, null, 2)}\n`);
  return complete;
}

export async function touchRecord(
  dir: string,
  record: FeedRecord,
  now: Date,
): Promise<FeedRecord> {
  const checked: FeedRecord = { ...record, checkedAt: now.toISOString() };
  await writeFile(recordPath(dir), `${JSON.stringify(checked, null, 2)}\n`);
  return checked;
}

/** What the caller could observe on disk without trusting the record. */
export interface CacheState {
  archiveBytes: number | null;
  gtfsPresent: boolean;
}

/**
 * The cache decision, kept pure so the interesting part is testable without a
 * filesystem. `revalidate` is only ever returned for geops, whose URL is mutable
 * and carries no version, so the server has to be asked.
 */
export function decideCache(
  record: FeedRecord | null,
  expectedResourceId: string | null,
  state: CacheState,
): 'hit' | 'download' | 'revalidate' {
  if (record === null) {
    return 'download';
  }

  if (state.archiveBytes !== record.archive.bytes || !state.gtfsPresent) {
    return 'download';
  }

  if (record.source === 'geops') {
    return 'revalidate';
  }

  // The CKAN resource uuid is immutable per publication — a new zip is always a
  // new resource, never a new body behind the same id — so matching it is a
  // strictly stronger check than an ETag, and it costs no request.
  return record.resource.id !== null && record.resource.id === expectedResourceId
    ? 'hit'
    : 'download';
}
