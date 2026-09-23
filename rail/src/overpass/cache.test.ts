import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isCacheHit, readRecord, recordPath, writeRecord } from './cache.ts';
import type { OverpassRecord } from './cache.ts';

const QUERY = 'relation["type"="route"]["route"="funicular"](area.ch);';

function record(overrides: Partial<OverpassRecord> = {}): OverpassRecord {
  return {
    version: 1,
    key: '0123456789abcdef',
    query: QUERY,
    endpoint: 'https://overpass-api.de/api/interpreter',
    timestampOsmBase: '2026-09-23T08:15:00Z',
    bytes: 1024,
    sha256: 'a'.repeat(64),
    fetchedAt: '2026-09-23T08:16:12.000Z',
    ...overrides,
  };
}

describe('isCacheHit', () => {
  const CASES: [string, OverpassRecord | null, number | null, boolean][] = [
    ['a record and a response of the recorded size', record(), 1024, true],
    ['no record', null, 1024, false],
    ['a response deleted by hand', record(), null, false],
    ['a response of another size', record(), 12, false],
    // Two queries sharing 64 bits of hash is unlikely, not impossible.
    ['a record for another query under the same key', record({ query: 'other' }), 1024, false],
  ];

  it.each(CASES)('%s → %s', (_label, cached, bytes, expected) => {
    expect(isCacheHit(cached, QUERY, bytes)).toBe(expected);
  });
});

describe('meta.json round trip', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'rail-overpass-cache-'));
  });

  afterEach(async () => {
    await rm(dir, { force: true, recursive: true });
  });

  it('reads back exactly what was written', async () => {
    const { version, ...body } = record();
    const written = await writeRecord(dir, body);

    expect(version).toBe(1);
    expect(await readRecord(dir, body.key)).toEqual(written);
  });

  const UNUSABLE: [string, string | null][] = [
    ['no file', null],
    ['truncated json', '{"version": 1'],
    ['a record from an older layout', '{"version": 0}'],
  ];

  it.each(UNUSABLE)('treats %s as no record', async (_label, contents) => {
    if (contents !== null) {
      await writeFile(recordPath(dir, record().key), contents);
    }

    expect(await readRecord(dir, record().key)).toBeNull();
  });
});
