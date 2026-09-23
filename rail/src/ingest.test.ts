import { appendFile, mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openGtfs, STORE } from './db.ts';
import { ingestStopTimes, STORE_FILE } from './ingest.ts';

/**
 * A handwritten feed rather than the real one, which is over 3 GB and only
 * exists on a machine that has run `pnpm build:data`. Rows are copied from the
 * 2026 feed, quoting and all, so the fixture cannot drift into a shape the
 * parser would never see.
 *
 * The sequences run 1, 2, 10 on purpose: as text 10 sorts between 1 and 2, so
 * any row order but 1, 2, 10 means the cast did not happen. `0085030` is there
 * for the opposite reason — a stop id that would lose its leading zero the
 * moment something decided it was a number.
 */
const STOP_TIMES = `trip_id,arrival_time,departure_time,stop_id,stop_sequence,pickup_type,drop_off_type
"1.TA.91-10-A-j26-1.1.H","","06:04:00","0085030","1","0","0"
"1.TA.91-10-A-j26-1.1.H","06:11:00","06:11:00","8503001","2","1","1"
"1.TA.91-10-A-j26-1.1.H","25:10:00","","8503006","10","0","0"
"2.TA.91-10-A-j26-1.1.R","","06:40:00","8503006","1","0","0"
"2.TA.91-10-A-j26-1.1.R","06:47:00","","0085030","2","0","0"
`;

/** The shape a mirror that re-derives the feed with fewer columns would have. */
const NO_SEQUENCE = `trip_id,arrival_time,departure_time,stop_id,pickup_type,drop_off_type
"1.TA.91-10-A-j26-1.1.H","","06:04:00","0085030","0","0"
`;

const HEADER_ONLY = `trip_id,arrival_time,departure_time,stop_id,stop_sequence,pickup_type,drop_off_type
`;

const logged: string[] = [];

const log = (message: string): void => {
  logged.push(message);
};

let feedDir: string;

async function writeFeed(contents: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'rail-ingest-'));
  await mkdir(join(dir, 'gtfs'));
  await writeFile(join(dir, 'gtfs', 'stop_times.txt'), contents, 'utf8');
  return dir;
}

beforeEach(async () => {
  logged.length = 0;
  feedDir = await writeFeed(STOP_TIMES);
});

afterEach(async () => {
  await rm(feedDir, { force: true, recursive: true });
});

describe('ingestStopTimes', () => {
  it('keeps the five columns the pipeline reads, and only those', async () => {
    await ingestStopTimes(feedDir, log, { force: false });

    const db = await openGtfs(join(feedDir, 'gtfs'), [], {
      store: join(feedDir, STORE_FILE),
    });

    try {
      expect(
        await db.query(
          `select column_name, column_type from (describe ${STORE}.stop_times)`,
        ),
      ).toEqual([
        { column_name: 'trip_id', column_type: 'VARCHAR' },
        { column_name: 'stop_sequence', column_type: 'INTEGER' },
        { column_name: 'stop_id', column_type: 'VARCHAR' },
        { column_name: 'pickup_type', column_type: 'VARCHAR' },
        { column_name: 'drop_off_type', column_type: 'VARCHAR' },
      ]);
    } finally {
      db.close();
    }
  });

  /** `0085030` is a station, not 85,030; a coerced id also stops joining. */
  it('orders a trip by sequence and keeps a leading zero on a stop id', async () => {
    await ingestStopTimes(feedDir, log, { force: false });

    const db = await openGtfs(join(feedDir, 'gtfs'), [], {
      store: join(feedDir, STORE_FILE),
    });

    try {
      expect(
        await db.query(
          `select stop_sequence, stop_id from ${STORE}.stop_times
           where trip_id = '1.TA.91-10-A-j26-1.1.H'`,
        ),
      ).toEqual([
        { stop_sequence: 1, stop_id: '0085030' },
        { stop_sequence: 2, stop_id: '8503001' },
        { stop_sequence: 10, stop_id: '8503006' },
      ]);
    } finally {
      db.close();
    }
  });

  it('counts every row and the trips they belong to', async () => {
    const ingest = await ingestStopTimes(feedDir, log, { force: false });

    expect(ingest).toMatchObject({ rows: 5, trips: 2, skipped: false });
    expect(logged.at(-1)).toContain('5 stop times over 2 trips');
  });

  it('answers a later step without the CSV it was built from', async () => {
    await ingestStopTimes(feedDir, log, { force: false });
    await rm(join(feedDir, 'gtfs', 'stop_times.txt'));

    const db = await openGtfs(join(feedDir, 'gtfs'), [], {
      store: join(feedDir, STORE_FILE),
    });

    try {
      expect(await db.query(`select count(*)::integer as n from ${STORE}.stop_times`)).toEqual([
        { n: 5 },
      ]);
    } finally {
      db.close();
    }
  });

  it('leaves the stored table alone on a second run', async () => {
    const first = await ingestStopTimes(feedDir, log, { force: false });
    const second = await ingestStopTimes(feedDir, log, { force: false });

    expect(first.skipped).toBe(false);
    expect(second).toMatchObject({ rows: 5, trips: 2, skipped: true });
    expect(logged.at(-1)).toContain('already ingested');
  });

  it('re-reads the CSV when it has changed since the store was written', async () => {
    await ingestStopTimes(feedDir, log, { force: false });

    const path = join(feedDir, 'gtfs', 'stop_times.txt');
    await appendFile(path, '"3.TA.91-10-A-j26-1.1.H","07:00:00","07:01:00","8503000","1","0","0"\n');

    // A same-second append would leave mtime unchanged on a coarse filesystem;
    // the size has moved either way, and the check reads both.
    expect((await stat(path)).size).toBeGreaterThan(STOP_TIMES.length);

    expect(await ingestStopTimes(feedDir, log, { force: false })).toMatchObject({
      rows: 6,
      trips: 3,
      skipped: false,
    });
  });

  it('re-reads an unchanged CSV when forced', async () => {
    await ingestStopTimes(feedDir, log, { force: false });

    expect(await ingestStopTimes(feedDir, log, { force: true })).toMatchObject({
      rows: 5,
      skipped: false,
    });
  });

  it('names the column a feed is missing rather than failing inside the load', async () => {
    const mirror = await writeFeed(NO_SEQUENCE);

    try {
      await expect(ingestStopTimes(mirror, log, { force: false })).rejects.toThrow(
        /missing stop_sequence/,
      );
    } finally {
      await rm(mirror, { force: true, recursive: true });
    }
  });

  it('fails on an empty feed rather than caching zero stop times', async () => {
    const empty = await writeFeed(HEADER_ONLY);

    try {
      await expect(ingestStopTimes(empty, log, { force: false })).rejects.toThrow(
        /yielded no stop times/,
      );
    } finally {
      await rm(empty, { force: true, recursive: true });
    }
  });
});
