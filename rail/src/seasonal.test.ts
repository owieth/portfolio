import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { expandCalendar } from './calendar.ts';
import { flagSeasonal } from './seasonal.ts';
import type { SeasonalFeedLine, SeasonalLine } from './seasonal.ts';
import type { ManualLine } from './seed.ts';
import type { SequencedFeedLine, SequencedLine } from './sequence.ts';

/**
 * A handwritten feed run through the calendar step first, so the service days
 * this step reads are the ones that step really writes. Headers and quoting are
 * copied from the 2026 feed, `frequencies.txt` included: every row of it has
 * `exact_times` 0, and the templates are funiculars and lifts.
 *
 * The 2026 feed year runs from Sunday 14 December to Saturday 12 December, 364
 * days and 52 weeks, and the reference week is 7 to 13 September.
 */
const FEED_INFO = `﻿feed_publisher_name,feed_publisher_url,feed_lang,feed_start_date,feed_end_date,feed_version
"SBB","https://sbb.ch","DE","20251214","20261212","20260919"
`;

/**
 * Every day; weekends only; 9 May to 25 October, as the Brienz Rothorn Bahn
 * runs; and April only, a season that is over before the reference week.
 */
const CALENDAR = `﻿service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date
"TA","1","1","1","1","1","1","1","20251214","20261212"
"TA+we","0","0","0","0","0","1","1","20251214","20261212"
"TA+sum","1","1","1","1","1","1","1","20260509","20261025"
"TA+apr","1","1","1","1","1","1","1","20260401","20260430"
`;

const TRIPS = `﻿route_id,service_id,trip_id,trip_headsign,trip_short_name,direction_id,block_id,original_trip_id,hints
"r-year","TA","year.1","","1","0","","",""
"r-year","TA","year.2","","2","1","","",""
"r-summer","TA+sum","summer.1","","1","0","","",""
"r-summer","TA+sum","summer.2","","2","1","","",""
"r-summer","TA+sum","summer.3","","3","0","","",""
"r-weekend","TA+we","weekend.1","","1","0","","",""
"r-shared-a","TA","shared.a","","1","0","","",""
"r-shared-b","TA+we","shared.b","","2","0","","",""
"r-fun","TA",".ojp-93-FUN.1.TA.1.j26","","1","0","","",""
"r-fun","TA",".ojp-93-FUN.1.TA.2.j26","","2","1","","",""
"r-fun","TA",".ojp-93-FUN.1.TA.3.j26","","3","0","","",""
"r-late","TA",".ojp-93-LATE.1.TA.1.j26","","1","0","","",""
"r-spring","TA+apr","spring.1","","1","0","","",""
`;

/**
 * Up the hill every ten minutes all day, 72 departures; down it every ten
 * minutes in the morning and every twenty after, 30 and 21; and one evening
 * trip in `trips.txt` alone, which is a trip like any other. Then a window that
 * runs past midnight on the previous day's service, 23:30 to 01:00 every half
 * hour, which is three departures.
 */
const FREQUENCIES = `﻿trip_id,start_time,end_time,headway_secs,exact_times
".ojp-93-FUN.1.TA.1.j26","07:00:00","19:00:00","600","0"
".ojp-93-FUN.1.TA.2.j26","07:05:00","12:05:00","600","0"
".ojp-93-FUN.1.TA.2.j26","12:05:00","19:05:00","1200","0"
".ojp-93-LATE.1.TA.1.j26","23:30:00","25:00:00","1800","0"
`;

function feedLine(id: string, routeIds: string[]): SequencedFeedLine {
  return {
    id,
    category: 'FUN',
    number: null,
    region: 'test',
    terminals: null,
    operators: ['Test'],
    routeIds,
    stations: [],
    name: id,
    nameSource: 'derived',
    review: [],
    source: 'feed',
    sequence: [],
    patterns: [],
  };
}

const GELMERBAHN: ManualLine = {
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
    { didok: '8531014', name: 'Gelmersee', lat: 46.614439, lon: 8.320473 },
    { didok: '8531013', name: 'Handegg', lat: 46.613585, lon: 8.308709 },
  ],
};

const LINES: SequencedLine[] = [
  feedLine('test:fun', ['r-fun']),
  GELMERBAHN,
  feedLine('test:late', ['r-late']),
  feedLine('test:shared', ['r-shared-a', 'r-shared-b']),
  feedLine('test:spring', ['r-spring']),
  feedLine('test:summer', ['r-summer']),
  feedLine('test:weekend', ['r-weekend']),
  feedLine('test:year', ['r-year']),
];

interface Fixture {
  frequencies?: string;
}

const logged: string[] = [];

const log = (message: string): void => {
  logged.push(message);
};

const directories: string[] = [];

async function writeFeed({ frequencies = FREQUENCIES }: Fixture = {}): Promise<string> {
  const files = {
    feed_info: FEED_INFO,
    calendar: CALENDAR,
    calendar_dates: 'service_id,date,exception_type\n',
    trips: TRIPS,
    frequencies,
  };
  const dir = await mkdtemp(join(tmpdir(), 'rail-seasonal-'));
  directories.push(dir);
  await mkdir(join(dir, 'gtfs'));
  await Promise.all(
    Object.entries(files).map(([file, contents]) =>
      writeFile(join(dir, 'gtfs', `${file}.txt`), contents, 'utf8'),
    ),
  );
  return dir;
}

async function run(fixture: Fixture = {}): Promise<Map<string, SeasonalLine>> {
  const feedDir = await writeFeed(fixture);
  const calendar = await expandCalendar(feedDir, log);
  logged.length = 0;

  const { lines } = await flagSeasonal(
    feedDir,
    { lines: LINES, window: calendar.window, referenceWeek: calendar.referenceWeek },
    log,
  );

  return new Map(lines.map(line => [line.id, line]));
}

function numbers(line: SeasonalLine | undefined): Partial<SeasonalFeedLine> | undefined {
  return (
    line && {
      serviceDays: line.serviceDays ?? undefined,
      serviceWeeks: line.serviceWeeks ?? undefined,
      seasonal: line.seasonal ?? undefined,
      tripsPerWeek: line.tripsPerWeek ?? undefined,
    }
  );
}

afterEach(async () => {
  logged.length = 0;
  await Promise.all(
    directories.splice(0).map(dir => rm(dir, { force: true, recursive: true })),
  );
});

describe('flagSeasonal', () => {
  it('leaves a line that runs every day unflagged', async () => {
    const lines = await run();

    expect(numbers(lines.get('test:year'))).toEqual({
      serviceDays: 364,
      serviceWeeks: 52,
      seasonal: false,
      tripsPerWeek: 14,
    });
  });

  it('flags a line that only runs from May to October', async () => {
    const lines = await run();

    expect(numbers(lines.get('test:summer'))).toEqual({
      serviceDays: 170,
      serviceWeeks: 26,
      seasonal: true,
      tripsPerWeek: 21,
    });
  });

  it('does not flag a line that runs at weekends all year, on fewer days than a summer one', async () => {
    const lines = await run();

    expect(numbers(lines.get('test:weekend'))).toEqual({
      serviceDays: 104,
      serviceWeeks: 52,
      seasonal: false,
      tripsPerWeek: 2,
    });
  });

  it('counts a day two routes of one line share once, and both their trips', async () => {
    const lines = await run();

    expect(numbers(lines.get('test:shared'))).toMatchObject({
      serviceDays: 364,
      tripsPerWeek: 7 + 2,
    });
  });

  it('counts a funicular in frequencies.txt by its departures, not by its template trips', async () => {
    const lines = await run();

    // 72 up, 30 + 21 down, and the one ordinary trip, on seven days.
    expect(numbers(lines.get('test:fun'))).toMatchObject({ tripsPerWeek: (72 + 51 + 1) * 7 });
    expect(logged).toContain('3 trips on 2 lines run from frequencies.txt and are counted by their departures');
  });

  it('reads a frequency window that runs past midnight', async () => {
    const lines = await run();

    expect(numbers(lines.get('test:late'))).toMatchObject({ tripsPerWeek: 3 * 7 });
  });

  it('lists a seasonal line that runs no trip in the reference week', async () => {
    const lines = await run();

    expect(numbers(lines.get('test:spring'))).toEqual({
      serviceDays: 30,
      serviceWeeks: 5,
      seasonal: true,
      tripsPerWeek: 0,
    });
    expect(logged).toContain(
      '1 line run no trip in the reference week, 2026-09-07 to 2026-09-13: test:spring',
    );
  });

  it('gives a hand-written line no numbers rather than zeroes', async () => {
    const lines = await run();

    expect(lines.get(GELMERBAHN.id)).toMatchObject({
      serviceDays: null,
      serviceWeeks: null,
      seasonal: null,
      tripsPerWeek: null,
    });
  });

  it('keeps the sequence step’s order and logs how many lines are seasonal', async () => {
    const lines = await run();

    expect([...lines.keys()]).toEqual(LINES.map(line => line.id));
    expect(logged[0]).toMatch(
      /^2 lines of 7 run in fewer than two thirds of the feed year's 52 weeks and are flagged seasonal — [0-9.]+s, fingerprint [0-9a-f]{16}$/,
    );
  });

  it('refuses a frequency window it cannot count', async () => {
    const feedDir = await writeFeed({
      frequencies: `${FREQUENCIES}".ojp-93-LATE.1.TA.1.j26","08:00:00","07:00:00","600","0"\n"year.1","8h","09:00:00","0","0"\n`,
    });
    const calendar = await expandCalendar(feedDir, log);

    await expect(
      flagSeasonal(
        feedDir,
        { lines: LINES, window: calendar.window, referenceWeek: calendar.referenceWeek },
        log,
      ),
    ).rejects.toThrow(
      'frequencies.txt has 2 rows with a time that does not parse, a headway that is not positive or an end_time that is not after start_time; nothing can be counted from them',
    );
  });

  it('refuses a store the calendar step has not written', async () => {
    const feedDir = await writeFeed();

    await expect(
      flagSeasonal(
        feedDir,
        {
          lines: LINES,
          window: { first: '2025-12-14', last: '2026-12-12' },
          referenceWeek: { first: '2026-09-07', last: '2026-09-13' },
        },
        log,
      ),
    ).rejects.toThrow(
      'has no service_days table; the calendar step writes it and has to run first',
    );
  });

  it('comes out the same on a second run', async () => {
    const feedDir = await writeFeed();
    const calendar = await expandCalendar(feedDir, log);
    const input = { lines: LINES, window: calendar.window, referenceWeek: calendar.referenceWeek };

    const first = await flagSeasonal(feedDir, input, log);
    const second = await flagSeasonal(feedDir, input, log);

    expect(second.lines).toEqual(first.lines);
    expect(second.fingerprint).toBe(first.fingerprint);
  });
});
