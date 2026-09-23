import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { expandCalendar } from './calendar.ts';
import { openGtfs, STORE } from './db.ts';
import { ingestStopTimes, STORE_FILE } from './ingest.ts';
import { derivePatterns } from './patterns.ts';
import type { PatternInput } from './patterns.ts';

/**
 * A handwritten feed rather than the real one, run through the ingest and
 * calendar steps first so the store this step reads is the one they really
 * write. Stops, headers and quoting are copied from the 2026 feed.
 *
 * The line is the S12 as the 2026 feed runs it: Brugg AG to Winterthur, then on
 * to either Schaffhausen or Wil SG, with short-turns at Winterthur. Around it, an
 * EC-shaped route that leaves Switzerland at Schaffhausen, a German route that
 * serves one Swiss station and no more, and a bus the allowlist dropped.
 *
 * Every `trip_id` and `service_id` goes through `id`, so a test can regenerate
 * the same timetable under different ids — which is what every republication of
 * the real feed does.
 */
const BRUGG = '8500309';
const EFFRETIKON = '8503305';
const WINTERTHUR = '8506000';
const SCHAFFHAUSEN = '8503424';
const WIL = '8506206';

const S12 = '91-12-j26-1';
const EC = '91-EC-j26-1';
const GERMAN = '91-RE-j26-1';
const BUS = '92-7-j26-1';

const FEED_INFO = `﻿feed_publisher_name,feed_publisher_url,feed_lang,feed_start_date,feed_end_date,feed_version
"SBB","https://sbb.ch","DE","20251214","20261212","20260919"
`;

/** Platforms under their stations, and a German station outside the Swiss set. */
const STOPS = `﻿stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station,platform_code,original_stop_id,didok
"Parentch:1:sloid:309","Brugg AG","47.48086045","8.20884100","1","","","ch:1:sloid:309","8500309"
"ch:1:sloid:309:1:1","Brugg AG","47.48121258","8.20921829","","Parentch:1:sloid:309","1","ch:1:sloid:309:1:1","8500309"
"ch:1:sloid:309:2:2","Brugg AG","47.48141292","8.20949677","","Parentch:1:sloid:309","2","ch:1:sloid:309:2:2","8500309"
"Parentch:1:sloid:3305","Effretikon","47.42581495","8.68668185","1","","","ch:1:sloid:3305","8503305"
"ch:1:sloid:3305:1:1","Effretikon","47.42563263","8.68662795","","Parentch:1:sloid:3305","1","ch:1:sloid:3305:1:1","8503305"
"Parentch:1:sloid:6000","Winterthur","47.50033307","8.72381820","1","","","ch:1:sloid:6000","8506000"
"ch:1:sloid:6000","Winterthur","47.50033307","8.72381820","","Parentch:1:sloid:6000","","ch:1:sloid:6000","8506000"
"ch:1:sloid:6000:1:1","Winterthur","47.50167427","8.72495906","","Parentch:1:sloid:6000","1","ch:1:sloid:6000:1:1","8506000"
"Parentch:1:sloid:3424","Schaffhausen","47.69828386","8.63275598","1","","","ch:1:sloid:3424","8503424"
"ch:1:sloid:3424:1:1","Schaffhausen","47.69697187","8.63162410","","Parentch:1:sloid:3424","1","ch:1:sloid:3424:1:1","8503424"
"Parentch:1:sloid:6206","Wil SG","47.46241308","9.04099536","1","","","ch:1:sloid:6206","8506206"
"ch:1:sloid:6206","Wil SG","47.46241308","9.04099536","","Parentch:1:sloid:6206","","ch:1:sloid:6206","8506206"
"Parent8014558","Singen (Hohentwiel)","47.75887763","8.84127293","1","","","8014558","8014558"
"8014558_gen:missingSLOID_pf:1","Singen (Hohentwiel)","47.75843679","8.84038359","","Parent8014558","1","","8014558"
`;

type Id = (id: string) => string;

const same: Id = id => id;

/** Every day, Fridays only, and never. */
function calendar(id: Id): string {
  return `﻿service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date
"${id('TA')}","1","1","1","1","1","1","1","20251214","20261212"
"${id('TA+fri')}","0","0","0","0","1","0","0","20251214","20261212"
"${id('TA+never')}","0","0","0","0","0","0","0","20251214","20261212"
`;
}

function trips(id: Id): string {
  return `﻿route_id,service_id,trip_id,trip_headsign,trip_short_name,direction_id,block_id,original_trip_id,hints
"${S12}","${id('TA')}","${id('1.TA.91-12-j26-1')}","Schaffhausen","12001","0","","",""
"${S12}","${id('TA')}","${id('2.TA.91-12-j26-1')}","Schaffhausen","12003","0","","",""
"${S12}","${id('TA+fri')}","${id('3.TA.91-12-j26-1')}","Wil SG","12005","0","","",""
"${S12}","${id('TA')}","${id('4.TA.91-12-j26-1')}","Winterthur","12007","0","","",""
"${S12}","${id('TA+never')}","${id('5.TA.91-12-j26-1')}","Winterthur","12009","0","","",""
"${EC}","${id('TA')}","${id('6.TA.91-EC-j26-1')}","Singen (Hohentwiel)","17","0","","",""
"${GERMAN}","${id('TA')}","${id('7.TA.91-RE-j26-1')}","Singen (Hohentwiel)","4711","0","","",""
"${BUS}","${id('TA')}","${id('8.TA.92-7-j26-1')}","Winterthur","701","0","","",""
`;
}

/**
 * Sequences run 1, 2, 10 where order matters, so a comparison as text would put
 * the last stop second. Trip 1 passes Effretikon without stopping; trip 2 takes
 * other platforms and calls at Winterthur on two of them in a row, which is one
 * visit.
 */
function stopTimes(id: Id): string {
  const rows = [
    ['1.TA.91-12-j26-1', 'ch:1:sloid:309:1:1', 1, 0],
    ['1.TA.91-12-j26-1', 'ch:1:sloid:3305:1:1', 2, 1],
    ['1.TA.91-12-j26-1', 'ch:1:sloid:6000:1:1', 3, 0],
    ['1.TA.91-12-j26-1', 'ch:1:sloid:3424:1:1', 10, 0],
    ['2.TA.91-12-j26-1', 'ch:1:sloid:309:2:2', 1, 0],
    ['2.TA.91-12-j26-1', 'ch:1:sloid:6000', 2, 0],
    ['2.TA.91-12-j26-1', 'ch:1:sloid:6000:1:1', 3, 0],
    ['2.TA.91-12-j26-1', 'ch:1:sloid:3424:1:1', 10, 0],
    ['3.TA.91-12-j26-1', 'ch:1:sloid:309:1:1', 1, 0],
    ['3.TA.91-12-j26-1', 'ch:1:sloid:6000:1:1', 2, 0],
    ['3.TA.91-12-j26-1', 'ch:1:sloid:6206', 10, 0],
    ['4.TA.91-12-j26-1', 'ch:1:sloid:309:1:1', 1, 0],
    ['4.TA.91-12-j26-1', 'ch:1:sloid:6000:1:1', 2, 0],
    ['5.TA.91-12-j26-1', 'ch:1:sloid:309:2:2', 1, 0],
    ['5.TA.91-12-j26-1', 'ch:1:sloid:6000', 2, 0],
    ['6.TA.91-EC-j26-1', 'ch:1:sloid:6000:1:1', 1, 0],
    ['6.TA.91-EC-j26-1', 'ch:1:sloid:3424:1:1', 2, 0],
    ['6.TA.91-EC-j26-1', '8014558_gen:missingSLOID_pf:1', 3, 0],
    ['7.TA.91-RE-j26-1', 'ch:1:sloid:3424:1:1', 1, 0],
    ['7.TA.91-RE-j26-1', '8014558_gen:missingSLOID_pf:1', 2, 0],
    ['8.TA.92-7-j26-1', 'ch:1:sloid:309:1:1', 1, 0],
    ['8.TA.92-7-j26-1', 'ch:1:sloid:6000:1:1', 2, 0],
  ] as const;

  const lines = rows.map(
    ([trip, stop, sequence, passes]) =>
      `"${id(trip)}","","06:00:00","${stop}","${sequence}","${passes}","${passes}"`,
  );

  return `trip_id,arrival_time,departure_time,stop_id,stop_sequence,pickup_type,drop_off_type
${lines.join('\n')}
`;
}

const INPUT: PatternInput = {
  routeIds: [S12, EC, GERMAN],
  didoks: [BRUGG, EFFRETIKON, WINTERTHUR, SCHAFFHAUSEN, WIL],
};

const logged: string[] = [];

const log = (message: string): void => {
  logged.push(message);
};

const directories: string[] = [];

interface Fixture {
  id?: Id;
  stops?: string;
  /** Skip the calendar step, as a build run out of order would. */
  withoutCalendar?: boolean;
}

async function writeFeed({ id = same, stops = STOPS, withoutCalendar = false }: Fixture = {}): Promise<string> {
  const files = {
    feed_info: FEED_INFO,
    stops,
    calendar: calendar(id),
    calendar_dates: 'service_id,date,exception_type\n',
    trips: trips(id),
    stop_times: stopTimes(id),
  };
  const dir = await mkdtemp(join(tmpdir(), 'rail-patterns-'));
  directories.push(dir);
  await mkdir(join(dir, 'gtfs'));
  await Promise.all(
    Object.entries(files).map(([file, contents]) =>
      writeFile(join(dir, 'gtfs', `${file}.txt`), contents, 'utf8'),
    ),
  );

  await ingestStopTimes(dir, log, { force: false });

  if (!withoutCalendar) {
    await expandCalendar(dir, log);
  }

  logged.length = 0;
  return dir;
}

afterEach(async () => {
  logged.length = 0;
  await Promise.all(
    directories.splice(0).map(dir => rm(dir, { force: true, recursive: true })),
  );
});

describe('derivePatterns', () => {
  it('gives a branching line one pattern per branch and one per short-turn', async () => {
    const { patterns } = await derivePatterns(await writeFeed(), log, INPUT);
    const s12 = patterns.filter(pattern => pattern.routeId === S12);

    expect(s12.map(pattern => pattern.stations)).toHaveLength(3);
    expect(s12.map(pattern => pattern.stations)).toEqual(
      expect.arrayContaining([
        [BRUGG, WINTERTHUR, SCHAFFHAUSEN],
        [BRUGG, WINTERTHUR, WIL],
        [BRUGG, WINTERTHUR],
      ]),
    );
  });

  it('collapses platforms into their station and leaves out stops the train only passes', async () => {
    const { patterns } = await derivePatterns(await writeFeed(), log, INPUT);
    const schaffhausen = patterns.find(
      pattern => pattern.routeId === S12 && pattern.stations.at(-1) === SCHAFFHAUSEN,
    );

    // Trips 1 and 2 differ in every platform, in Effretikon, and in calling at
    // Winterthur twice; as stations they are the same train.
    expect(schaffhausen).toMatchObject({ stations: [BRUGG, WINTERTHUR, SCHAFFHAUSEN], trips: 2 });
  });

  it('weights each trip by the days its service runs', async () => {
    const { patterns } = await derivePatterns(await writeFeed(), log, INPUT);
    const byEnd = new Map(
      patterns
        .filter(pattern => pattern.routeId === S12)
        .map(pattern => [pattern.stations.at(-1), pattern]),
    );

    expect(byEnd.get(SCHAFFHAUSEN)).toMatchObject({ trips: 2, runs: 2 * 364 });
    expect(byEnd.get(WIL)).toMatchObject({ trips: 1, runs: 52 });
    // A trip whose service never runs still counts as a trip, and adds no runs.
    expect(byEnd.get(WINTERTHUR)).toMatchObject({ trips: 2, runs: 364 });
  });

  it('keeps an international train’s Swiss stops and drops routes that have fewer than two', async () => {
    const result = await derivePatterns(await writeFeed(), log, INPUT);

    expect(result.patterns.filter(pattern => pattern.routeId === EC)).toEqual([
      expect.objectContaining({ stations: [WINTERTHUR, SCHAFFHAUSEN], trips: 1 }),
    ]);
    expect(result.patterns.some(pattern => pattern.routeId === GERMAN)).toBe(false);
    expect(result.patterns.some(pattern => pattern.routeId === BUS)).toBe(false);
    expect(result).toMatchObject({ routes: 2, branched: 1, foreign: 1, dropped: 1, unresolved: 0 });
    expect(logged).toContain(
      '1 allowed routes make no pattern, because none of their trips serves two Swiss stations',
    );
    expect(logged).toContain(
      '1 allowed trips serve fewer than two Swiss stations and make no pattern',
    );
  });

  it('comes out the same when the feed is republished under new trip and service ids', async () => {
    const first = await derivePatterns(await writeFeed(), log, INPUT);
    const republished = await derivePatterns(
      await writeFeed({ id: id => `x${id.split('').reverse().join('')}` }),
      log,
      INPUT,
    );

    expect(republished.patterns).toEqual(first.patterns);
    expect(republished.fingerprint).toBe(first.fingerprint);
  });

  it('stores the same rows in the same order on a second run', async () => {
    const feedDir = await writeFeed();
    const first = await derivePatterns(feedDir, log, INPUT);
    const second = await derivePatterns(feedDir, log, INPUT);

    expect(second.patterns).toEqual(first.patterns);
    expect(second.fingerprint).toBe(first.fingerprint);
  });

  it('hashes the station list and nothing else', async () => {
    const { patterns } = await derivePatterns(await writeFeed(), log, INPUT);
    const [pattern] = patterns;

    expect(pattern?.hash).toBe(
      createHash('sha256').update(pattern?.stations.join(' ') ?? '').digest('hex').slice(0, 16),
    );
    expect(
      patterns.every(
        other => other.stations.join(' ') !== pattern?.stations.join(' ') || other.hash === pattern?.hash,
      ),
    ).toBe(true);
  });

  it('stores no trip_id or service_id', async () => {
    const feedDir = await writeFeed();
    await derivePatterns(feedDir, log, INPUT);

    const db = await openGtfs(join(feedDir, 'gtfs'), [], { store: join(feedDir, STORE_FILE) });

    try {
      expect(
        await db.query(`select column_name, column_type from (describe ${STORE}.patterns)`),
      ).toEqual([
        { column_name: 'route_id', column_type: 'VARCHAR' },
        { column_name: 'pattern_hash', column_type: 'VARCHAR' },
        { column_name: 'stations', column_type: 'VARCHAR[]' },
        { column_name: 'trips', column_type: 'INTEGER' },
        { column_name: 'runs', column_type: 'INTEGER' },
      ]);
    } finally {
      db.close();
    }
  });

  it('names the column a mirror does not carry', async () => {
    const feedDir = await writeFeed({
      stops: `stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station
"Parentch:1:sloid:309","Brugg AG","47.48086045","8.20884100","1",""
`,
    });

    await expect(derivePatterns(feedDir, log, INPUT)).rejects.toThrow(
      'stops.txt is missing didok; rerun pnpm recon:data to see what the feed does carry',
    );
  });

  it('refuses a store the calendar step has not written to', async () => {
    const feedDir = await writeFeed({ withoutCalendar: true });

    await expect(derivePatterns(feedDir, log, INPUT)).rejects.toThrow(
      'rail.duckdb has no service_days table; the ingest and calendar steps write them and have to run first',
    );
  });

  it('fails when nothing makes a pattern, rather than handing on an empty table', async () => {
    const feedDir = await writeFeed();

    await expect(
      derivePatterns(feedDir, log, { routeIds: [S12], didoks: [] }),
    ).rejects.toThrow(/^no stop patterns came out of 5 allowed trips/);
  });
});
