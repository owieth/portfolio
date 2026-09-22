import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  assertSafeFeedId,
  decideCache,
  geopsFeedId,
  officialFeedId,
  readRecord,
  recordPath,
  touchRecord,
  withoutQuery,
  writeRecord,
} from './record.ts';
import type { CacheState, FeedRecord } from './record.ts';

const RESOURCE = '9febcd61-0a4b-446c-80a1-1924542f197d';

function record(overrides: Partial<FeedRecord> = {}): FeedRecord {
  return {
    version: 1,
    feedId: 'otd-fp2026-20260919',
    source: 'opentransportdata',
    timetableYear: 2026,
    dataset: {
      id: 'timetable-2026-gtfs2020',
      page: 'https://data.opentransportdata.swiss/en/dataset/timetable-2026-gtfs2020',
      catalogUrl: 'https://data.opentransportdata.swiss/en/dataset/timetable-2026-gtfs2020.jsonld',
      uuid: '3d2c18f9-9ef1-463f-a249-5c67604efd74',
      validFrom: '2025-12-14',
      validTo: '2026-12-12',
    },
    resource: {
      id: RESOURCE,
      filename: 'GTFS_FP2026_20260919.zip',
      issued: '2026-09-21T09:30:44.369891+02:00',
      modified: '2026-09-21T09:30:44.369891+02:00',
      declaredBytes: 256091382,
      license: 'http://dcat-ap.ch/vocabulary/licenses/terms_open',
    },
    download: {
      url: 'https://data.opentransportdata.swiss/…/gtfs_fp2026_20260919.zip',
      finalUrl: 'https://example.r2.cloudflarestorage.com/dx-omd-prod/…',
      etag: '"ce9d769b3a1b6d3f601eb0f49c51969b"',
      lastModified: 'Mon, 21 Sep 2026 07:30:54 GMT',
      contentLength: 256091382,
    },
    archive: { file: 'gtfs.zip', bytes: 256091382, sha256: 'a'.repeat(64) },
    entries: [{ name: 'routes.txt', bytes: 4823911 }],
    fetchedAt: '2026-09-22T14:33:55.000Z',
    checkedAt: '2026-09-22T14:33:55.000Z',
    ...overrides,
  };
}

const COMPLETE: CacheState = { archiveBytes: 256091382, gtfsPresent: true };

describe('feed ids', () => {
  it('carries the timetable year, because two series publish the same date', () => {
    expect(officialFeedId(2026, '20260919')).toBe('otd-fp2026-20260919');
    expect(officialFeedId(2027, '20260919')).toBe('otd-fp2027-20260919');
  });

  it('derives a geops id from the validators, which are its only version', () => {
    const id = geopsFeedId(
      'complete',
      'Mon, 21 Sep 2026 01:01:45 GMT',
      '"6ab081f9-b8dc69d"',
      new Date('2026-09-22T14:00:00Z'),
    );

    expect(id).toMatch(/^geops-complete-20260921-[0-9a-f]{8}$/);
  });

  it('falls back to the fetch time when the mirror sends no validators', () => {
    const id = geopsFeedId('complete', null, null, new Date('2026-09-22T14:00:00Z'));

    expect(id).toBe('geops-complete-20260922140000');
  });

  // A feed id becomes a directory name and is derived from remote input.
  const UNSAFE = ['../escape', 'otd/2026', 'OTD-2026', 'otd 2026', ''];

  it.each(UNSAFE)('refuses %j as a directory name', unsafe => {
    expect(() => assertSafeFeedId(unsafe)).toThrow(/refusing to use/);
  });
});

describe('withoutQuery', () => {
  it('strips the presigned credentials, which expire in a minute anyway', () => {
    expect(
      withoutQuery('https://example.r2.cloudflarestorage.com/a.zip?X-Amz-Signature=deadbeef'),
    ).toBe('https://example.r2.cloudflarestorage.com/a.zip');
  });
});

describe('decideCache', () => {
  const CASES: [string, FeedRecord | null, string | null, CacheState, string][] = [
    ['a matching resource id and a complete directory', record(), RESOURCE, COMPLETE, 'hit'],
    // The resource uuid is immutable per publication, so a different one is a
    // different feed, never the same bytes under a new name.
    ['a new publication', record(), 'a-different-resource-id', COMPLETE, 'download'],
    ['no record at all', null, RESOURCE, COMPLETE, 'download'],
    ['an archive deleted by hand', record(), RESOURCE, { archiveBytes: null, gtfsPresent: true }, 'download'],
    ['an archive of the wrong size', record(), RESOURCE, { archiveBytes: 12, gtfsPresent: true }, 'download'],
    // An interrupted extraction leaves the archive intact and gtfs/ missing.
    ['a missing extraction', record(), RESOURCE, { archiveBytes: 256091382, gtfsPresent: false }, 'download'],
    // The mirror's URL is mutable and undated, so only the server knows.
    ['a geops record', record({ source: 'geops', resource: { ...record().resource, id: null } }), null, COMPLETE, 'revalidate'],
  ];

  it.each(CASES)('returns %s → %s', (_label, cached, resourceId, state, expected) => {
    expect(decideCache(cached, resourceId, state)).toBe(expected);
  });
});

describe('feed.json round trip', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'rail-record-'));
  });

  afterEach(async () => {
    await rm(dir, { force: true, recursive: true });
  });

  it('reads back exactly what was written', async () => {
    const { version, ...body } = record();
    const written = await writeRecord(dir, body);

    expect(version).toBe(1);
    expect(await readRecord(dir)).toEqual(written);
  });

  it('advances checkedAt on a cache hit and leaves fetchedAt alone', async () => {
    const { version, ...body } = record();
    await writeRecord(dir, body);
    expect(version).toBe(1);

    const touched = await touchRecord(
      dir,
      (await readRecord(dir)) as FeedRecord,
      new Date('2026-12-14T08:00:00Z'),
    );

    expect(touched.checkedAt).toBe('2026-12-14T08:00:00.000Z');
    expect(touched.fetchedAt).toBe('2026-09-22T14:33:55.000Z');
  });

  // Absent, unreadable and stale all mean the same thing to the caller: download.
  const UNUSABLE: [string, string | null][] = [
    ['no file', null],
    ['truncated json', '{"version": 1'],
    ['a record from an older layout', '{"version": 0}'],
  ];

  it.each(UNUSABLE)('treats %s as no record', async (_label, contents) => {
    if (contents !== null) {
      await writeFile(recordPath(dir), contents);
    }

    expect(await readRecord(dir)).toBeNull();
  });
});
