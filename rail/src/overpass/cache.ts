/**
 * The Overpass cache under `data/raw/overpass/`: one raw response per query, and
 * a record next to it saying what was asked, of whom, and when.
 *
 * The record is written last, after the response has been renamed into place
 * and checked, which is the same atomicity rule `feed.json` follows: a record on
 * disk means the response beside it is whole. There is no expiry. OSM changes
 * every minute, and a cache that refreshed itself would make two builds over the
 * same feed disagree for no reason anyone could read out of the diff; deleting
 * the directory is the refresh.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { RAW_DIR } from '../paths.ts';

export const OVERPASS_DIR = join(RAW_DIR, 'overpass');

/** Bumped when a field changes meaning; an older record is refetched, not guessed at. */
const RECORD_VERSION = 1;

export interface OverpassRecord {
  version: number;
  key: string;
  /** Verbatim, so a reader can paste it into overpass-turbo and see the same thing. */
  query: string;
  endpoint: string;
  /** `osm3s.timestamp_osm_base`: the moment of the OSM data, not of the download. */
  timestampOsmBase: string;
  bytes: number;
  sha256: string;
  fetchedAt: string;
}

export function responsePath(dir: string, key: string): string {
  return join(dir, `${key}.json`);
}

export function recordPath(dir: string, key: string): string {
  return join(dir, `${key}.meta.json`);
}

/** Absent, unreadable and from an older layout all mean the same thing: fetch. */
export async function readRecord(
  dir: string,
  key: string,
): Promise<OverpassRecord | null> {
  let raw: string;

  try {
    raw = await readFile(recordPath(dir, key), 'utf8');
  } catch {
    return null;
  }

  try {
    const record = JSON.parse(raw) as OverpassRecord;
    return record?.version === RECORD_VERSION ? record : null;
  } catch {
    return null;
  }
}

export async function writeRecord(
  dir: string,
  record: Omit<OverpassRecord, 'version'>,
): Promise<OverpassRecord> {
  const complete: OverpassRecord = { version: RECORD_VERSION, ...record };
  await writeFile(
    recordPath(dir, record.key),
    `${JSON.stringify(complete, null, 2)}\n`,
  );
  return complete;
}

/**
 * Pure, so the decision is testable without a filesystem. The query is compared
 * as well as the key, because 64 bits of a hash is a name, not a proof, and the
 * size catches a response that was replaced or cut short by hand.
 */
export function isCacheHit(
  record: OverpassRecord | null,
  query: string,
  responseBytes: number | null,
): record is OverpassRecord {
  return (
    record !== null && record.query === query && record.bytes === responseBytes
  );
}
