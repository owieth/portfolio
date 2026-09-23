import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { expandCalendar } from './calendar.ts';
import { ingestStopTimes } from './ingest.ts';
import type { MatchedLine } from './match.ts';
import type { SequenceStop } from './sequence/order.ts';
import type { Station } from './stations.ts';
import { busiestEnd, findTermini, trunkEnds } from './termini.ts';
import type { TerminiLine } from './termini.ts';
import type { TrueEndRow } from './termini/queries.ts';

/**
 * A handwritten feed run through the ingest and calendar steps first, so the
 * store this step reads is the one they really write. Headers and quoting are
 * copied from the 2026 feed.
 *
 * Four lines: an EC from Zürich that runs on to Milano, with one Friday train
 * that turns at Chiasso; a domestic line; a Basel line whose trains split
 * evenly between Freiburg and Mulhouse; and a Schaffhausen line where one train
 * in four runs on to Singen.
 */
const ZURICH = '8503000';
const LUGANO = '8505300';
const CHIASSO = '8505307';
const COMO = '8301001';
const MILANO = '8300046';
const BRUGG = '8500309';
const WINTERTHUR = '8506000';
const LIESTAL = '8500023';
const BASEL = '8500010';
const FREIBURG = '8000107';
const MULHOUSE = '8700031';
const SCHAFFHAUSEN = '8503424';
const SINGEN = '8014558';

const SWISS = [
  ZURICH,
  LUGANO,
  CHIASSO,
  BRUGG,
  WINTERTHUR,
  LIESTAL,
  BASEL,
  SCHAFFHAUSEN,
];

const NAMES: Record<string, string> = {
  [ZURICH]: 'Zürich HB',
  [LUGANO]: 'Lugano',
  [CHIASSO]: 'Chiasso',
  [COMO]: 'Como S. Giovanni',
  [MILANO]: 'Milano Centrale',
  [BRUGG]: 'Brugg AG',
  [WINTERTHUR]: 'Winterthur',
  [LIESTAL]: 'Liestal',
  [BASEL]: 'Basel SBB',
  [FREIBURG]: 'Freiburg (Breisgau) Hbf',
  [MULHOUSE]: 'Mulhouse',
  [SCHAFFHAUSEN]: 'Schaffhausen',
  [SINGEN]: 'Singen (Hohentwiel)',
};

const FEED_INFO = `﻿feed_publisher_name,feed_publisher_url,feed_lang,feed_start_date,feed_end_date,feed_version
"SBB","https://sbb.ch","DE","20251214","20261212","20260919"
`;

/**
 * Every station standalone, except Milano Centrale, which the trains reach on a
 * platform under it, as the feed's foreign stations mostly are.
 */
const STOPS = `﻿stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station,platform_code,original_stop_id,didok
${Object.entries(NAMES)
  .map(
    ([didok, name]) =>
      `"${didok}","${name}","47.0","8.0","${didok === MILANO ? '1' : ''}","","","${didok}","${didok}"`,
  )
  .join('\n')}
"${MILANO}_pf:12","Milano Centrale","45.48","9.20","","${MILANO}","12","","${MILANO}"
`;

/** Every day, and Fridays only. */
const CALENDAR = `﻿service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date
"TA","1","1","1","1","1","1","1","20251214","20261212"
"TA+fri","0","0","0","0","1","0","0","20251214","20261212"
`;

/** Trip, route, service, then its stops in running order; `~` marks a stop the train only passes. */
const TIMETABLE: [string, string, string, string[]][] = [
  ['ec.1', 'r-ec', 'TA', [ZURICH, LUGANO, CHIASSO, COMO, `${MILANO}_pf:12`]],
  ['ec.2', 'r-ec', 'TA', [`${MILANO}_pf:12`, COMO, CHIASSO, LUGANO, ZURICH]],
  ['ec.3', 'r-ec', 'TA+fri', [ZURICH, LUGANO, CHIASSO]],
  ['s.1', 'r-s', 'TA', [BRUGG, WINTERTHUR]],
  ['s.2', 'r-s', 'TA', [WINTERTHUR, BRUGG]],
  ['re.1', 'r-re', 'TA', [LIESTAL, BASEL, FREIBURG]],
  ['re.2', 'r-re', 'TA', [LIESTAL, BASEL, MULHOUSE]],
  ['sh.1', 'r-sh', 'TA', [WINTERTHUR, SCHAFFHAUSEN]],
  ['sh.2', 'r-sh', 'TA', [WINTERTHUR, SCHAFFHAUSEN]],
  ['sh.3', 'r-sh', 'TA', [WINTERTHUR, SCHAFFHAUSEN, `~${SINGEN}`]],
  ['sh.4', 'r-sh', 'TA+fri', [WINTERTHUR, SCHAFFHAUSEN, SINGEN]],
];

const TRIPS = `﻿route_id,service_id,trip_id,trip_headsign,trip_short_name,direction_id,block_id,original_trip_id,hints
${TIMETABLE.map(([trip, route, service]) => `"${route}","${service}","${trip}","","1","0","","",""`).join('\n')}
`;

/** Sequences run 1, 2, 10, so a comparison as text would put the last stop second. */
const STOP_TIMES = `trip_id,arrival_time,departure_time,stop_id,stop_sequence,pickup_type,drop_off_type
${TIMETABLE.flatMap(([trip, , , stops]) =>
  stops.map((stop, index) => {
    const passes = stop.startsWith('~') ? 1 : 0;
    const sequence = index < 2 ? index + 1 : index * 10;
    return `"${trip}","","06:00:00","${stop.replace('~', '')}","${sequence}","${passes}","${passes}"`;
  }),
).join('\n')}
`;

const STATIONS: Station[] = SWISS.map(didok => ({
  didok,
  sloid: null,
  name: NAMES[didok] ?? didok,
  lat: 47,
  lon: 8,
  stops: 0,
}));

function sequence(didoks: string[], branch: string[] = []): SequenceStop[] {
  return [
    ...didoks.map(didok => ({
      didok,
      via: 'backbone' as const,
      junction: null,
    })),
    ...branch.map(didok => ({
      didok,
      via: 'branch' as const,
      junction: didoks[0] ?? null,
    })),
  ];
}

function feedLine(
  id: string,
  routeIds: string[],
  stops: SequenceStop[],
): MatchedLine {
  return {
    id,
    category: 'EC',
    number: null,
    region: 'test',
    terminals: null,
    operators: ['Test'],
    routeIds,
    stations: stops.map(stop => stop.didok),
    name: id,
    nameSource: 'derived',
    review: [],
    source: 'feed',
    sequence: stops,
    patterns: [],
    serviceDays: 364,
    serviceWeeks: 52,
    seasonal: false,
    tripsPerWeek: 7,
    hasGeometry: false,
    geometry: null,
    match: null,
  };
}

const GELMERBAHN: MatchedLine = {
  id: 'kwo-seilbahnen:FUN:8531013-8531014',
  category: 'FUN',
  number: null,
  region: 'kwo-seilbahnen',
  terminals: ['8531013', '8531014'],
  operators: ['KWO Seilbahnen'],
  routeIds: [],
  stations: ['8531013', '8531014'],
  name: 'Gelmerbahn',
  nameSource: 'manual',
  review: [],
  source: 'manual',
  stops: [
    { didok: '8531013', name: 'Handegg', lat: 46.613585, lon: 8.308709 },
    { name: 'Gelmersee', lat: 46.614439, lon: 8.320473 },
  ],
  serviceDays: null,
  serviceWeeks: null,
  seasonal: null,
  tripsPerWeek: null,
  hasGeometry: false,
  geometry: null,
  match: null,
};

const LINES: MatchedLine[] = [
  feedLine('test:ec', ['r-ec'], sequence([ZURICH, LUGANO, CHIASSO])),
  GELMERBAHN,
  feedLine('test:re', ['r-re'], sequence([LIESTAL, BASEL])),
  feedLine('test:s', ['r-s'], sequence([BRUGG, WINTERTHUR])),
  feedLine('test:sh', ['r-sh'], sequence([WINTERTHUR, SCHAFFHAUSEN])),
];

const logged: string[] = [];

const log = (message: string): void => {
  logged.push(message);
};

const directories: string[] = [];

async function writeFeed(): Promise<string> {
  const files = {
    feed_info: FEED_INFO,
    stops: STOPS,
    calendar: CALENDAR,
    calendar_dates: 'service_id,date,exception_type\n',
    trips: TRIPS,
    stop_times: STOP_TIMES,
  };
  const dir = await mkdtemp(join(tmpdir(), 'rail-termini-'));
  directories.push(dir);
  await mkdir(join(dir, 'gtfs'));
  await Promise.all(
    Object.entries(files).map(([file, contents]) =>
      writeFile(join(dir, 'gtfs', `${file}.txt`), contents, 'utf8'),
    ),
  );

  await ingestStopTimes(dir, log, { force: false });
  await expandCalendar(dir, log);

  logged.length = 0;
  return dir;
}

async function run(
  lines: MatchedLine[] = LINES,
): Promise<Map<string, TerminiLine>> {
  const found = await findTermini(
    await writeFeed(),
    { lines, stations: STATIONS },
    log,
  );
  return new Map(found.lines.map(line => [line.id, line]));
}

function names(
  line: TerminiLine | undefined,
): { termini: string[]; trueTermini: string[] } | undefined {
  return (
    line && {
      termini: line.termini.map(end => end.name),
      trueTermini: line.trueTermini.map(end => end.name),
    }
  );
}

afterEach(async () => {
  logged.length = 0;
  await Promise.all(
    directories.splice(0).map(dir => rm(dir, { force: true, recursive: true })),
  );
});

describe('findTermini', () => {
  it('runs an EC past Chiasso to Milano, by the station and not its platform', async () => {
    const lines = await run();

    expect(names(lines.get('test:ec'))).toEqual({
      termini: ['Zürich HB', 'Chiasso'],
      trueTermini: ['Zürich HB', 'Milano Centrale'],
    });
    expect(lines.get('test:ec')?.trueTermini[1].didok).toBe(MILANO);
  });

  it('gives a domestic line the same termini twice', async () => {
    const line = (await run()).get('test:s');

    expect(names(line)).toEqual({
      termini: ['Brugg AG', 'Winterthur'],
      trueTermini: ['Brugg AG', 'Winterthur'],
    });
  });

  it('breaks a tie between two foreign ends on the lower Didok number', async () => {
    const line = (await run()).get('test:re');

    expect(line?.trueTermini[1]).toEqual({
      didok: FREIBURG,
      name: 'Freiburg (Breisgau) Hbf',
    });
  });

  it('keeps the Swiss terminus when most trains end there, and ignores a stop only passed', async () => {
    const line = (await run()).get('test:sh');

    expect(names(line)?.trueTermini).toEqual(['Winterthur', 'Schaffhausen']);
  });

  it('takes a seeded line’s first and last stop as both kinds of termini', async () => {
    const line = (await run()).get(GELMERBAHN.id);

    expect(line?.termini).toEqual([
      { didok: '8531013', name: 'Handegg' },
      { didok: null, name: 'Gelmersee' },
    ]);
    expect(line?.trueTermini).toEqual(line?.termini);
  });

  it('lists the international lines and logs them', async () => {
    const found = await findTermini(
      await writeFeed(),
      { lines: LINES, stations: STATIONS },
      log,
    );

    expect(found.international).toEqual(['test:ec', 'test:re']);
    expect(logged[0]).toMatch(/^2 lines of 5 run past the border/);
    expect(logged[1]).toContain(
      'test:ec (Zürich HB–Chiasso runs Zürich HB–Milano Centrale)',
    );
  });

  it('fingerprints the same feed the same way twice', async () => {
    const first = await findTermini(
      await writeFeed(),
      { lines: LINES, stations: STATIONS },
      log,
    );
    const second = await findTermini(
      await writeFeed(),
      { lines: LINES, stations: STATIONS },
      log,
    );

    expect(second.fingerprint).toBe(first.fingerprint);
  });

  it('stops when a terminus is not a station the stations step kept', async () => {
    const stations = STATIONS.filter(station => station.didok !== BRUGG);

    await expect(
      findTermini(await writeFeed(), { lines: LINES, stations }, log),
    ).rejects.toThrow(
      /test:s ends at 8500309, which the stations step does not have/,
    );
  });
});

describe('trunkEnds', () => {
  it('ends the trunk before the branch blocks', () => {
    const line = feedLine(
      'test:branched',
      [],
      sequence([BRUGG, WINTERTHUR, SCHAFFHAUSEN], [LIESTAL]),
    );

    expect(trunkEnds(line as Extract<MatchedLine, { source: 'feed' }>)).toEqual(
      [BRUGG, SCHAFFHAUSEN],
    );
  });
});

describe('busiestEnd', () => {
  const row = (
    true_didok: string,
    runs: number,
    trips: number,
  ): TrueEndRow => ({
    line_id: 'test:x',
    swiss_end: BASEL,
    true_didok,
    true_name: true_didok,
    trips,
    runs,
  });

  it('ranks by runs, then trips, then the lower Didok number', () => {
    expect(
      busiestEnd([row(MULHOUSE, 10, 1), row(FREIBURG, 5, 9)])?.true_didok,
    ).toBe(MULHOUSE);
    expect(
      busiestEnd([row(MULHOUSE, 5, 2), row(FREIBURG, 5, 1)])?.true_didok,
    ).toBe(MULHOUSE);
    expect(
      busiestEnd([row(MULHOUSE, 5, 1), row(FREIBURG, 5, 1)])?.true_didok,
    ).toBe(FREIBURG);
  });

  it('has nothing to pick from no rows', () => {
    expect(busiestEnd([])).toBeNull();
  });
});
