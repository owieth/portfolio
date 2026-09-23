import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { expandCalendar } from './calendar.ts';
import { openGtfs, STORE } from './db.ts';
import { STORE_FILE } from './ingest.ts';

/**
 * A handwritten feed rather than the real one, whose `calendar_dates.txt` alone
 * is 11 million rows. The header rows, the byte-order mark and the quoting are
 * copied from the 2026 feed, so the fixture cannot drift into a shape the parser
 * would never see.
 *
 * One service per branch: every day, a weekday pattern with removals and an
 * addition, a pattern that reaches past the feed year on both sides, one that
 * runs on no weekday at all, one defined only in `calendar_dates.txt`, and one
 * no file defines.
 */
const FEED_INFO = `﻿feed_publisher_name,feed_publisher_url,feed_lang,feed_start_date,feed_end_date,feed_version
"SBB","https://sbb.ch","DE","20251214","20261212","20260919"
`;

const CALENDAR = `﻿service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date
"TA","1","1","1","1","1","1","1","20251214","20261212"
"TA+00000","0","0","0","0","1","0","0","20251214","20261212"
"TA+he000","1","1","1","1","1","1","1","20251214","20261212"
"TA+wide00","1","1","1","1","1","1","1","20251101","20270131"
"TA+never0","0","0","0","0","0","0","0","20251214","20261212"
`;

/**
 * `TA+he000` is the Schynige Platte Bahn's service in the 2026 feed, and this is
 * how the feed says "summer only": every day of the year in `calendar.txt`, and
 * every day outside 13 June to 25 October removed again here — 229 rows of it,
 * generated rather than pasted.
 */
function offSeason(): string {
  const rows: string[] = [];

  for (let day = Date.UTC(2025, 11, 14); day <= Date.UTC(2026, 11, 12); day += 86_400_000) {
    const date = new Date(day).toISOString().slice(0, 10);

    if (date < '2026-06-13' || date > '2026-10-25') {
      rows.push(`"TA+he000","${date.replaceAll('-', '')}","2"`);
    }
  }

  return rows.join('\n');
}

const CALENDAR_DATES = `﻿service_id,date,exception_type
"TA+00000","20251219","2"
"TA+00000","20251226","2"
"TA+00000","20251227","1"
"TA+added0","20260801","1"
"TA+added0","20261213","1"
${offSeason()}
`;

const TRIPS = `﻿route_id,service_id,trip_id,trip_headsign,trip_short_name,direction_id,block_id,original_trip_id,hints
"91-10-A-j26-1","TA","1.TA.91-10-A-j26-1.1.H","Zürich HB","18014","0","","ch:1:sjyid:100001:18014-001","FS"
"91-10-A-j26-1","TA+00000","2.TA.91-10-A-j26-1.1.H","Zürich HB","18016","0","","ch:1:sjyid:100001:18016-001","FS"
"91-10-A-j26-1","TA+00000","3.TA.91-10-A-j26-1.1.R","Uetliberg","18017","1","","ch:1:sjyid:100001:18017-001","FS"
"93-68-j26-1","TA+he000",".ojp-93-68.1.TA.1.j26","Schynige Platte","641","0","","ch:1:sjyid:100113:plan:641","2 PH TG VN"
"92-fri-j26-1","TA+00000","4.TA.92-fri-j26-1.1.H","Fridays","1","0","","",""
"92-wide-j26-1","TA+wide00","5.TA.92-wide-j26-1.1.H","Wide","2","0","","",""
"92-never-j26-1","TA+never0","6.TA.92-never-j26-1.1.H","Never","3","0","","",""
"92-added-j26-1","TA+added0","7.TA.92-added-j26-1.1.H","Added","4","0","","",""
"92-lost-j26-1","TA+lost00","8.TA.92-lost-j26-1.1.H","Lost","5","0","","",""
`;

interface Fixture {
  feed_info?: string;
  calendar?: string;
  calendar_dates?: string;
  trips?: string;
}

const logged: string[] = [];

const log = (message: string): void => {
  logged.push(message);
};

const directories: string[] = [];

async function writeFeed(overrides: Fixture = {}): Promise<string> {
  const files = {
    feed_info: FEED_INFO,
    calendar: CALENDAR,
    calendar_dates: CALENDAR_DATES,
    trips: TRIPS,
    ...overrides,
  };
  const dir = await mkdtemp(join(tmpdir(), 'rail-calendar-'));
  directories.push(dir);
  await mkdir(join(dir, 'gtfs'));
  await Promise.all(
    Object.entries(files).map(([file, contents]) =>
      writeFile(join(dir, 'gtfs', `${file}.txt`), contents, 'utf8'),
    ),
  );
  return dir;
}

async function storedDays(feedDir: string, service: string): Promise<string[]> {
  const db = await openGtfs(join(feedDir, 'gtfs'), [], { store: join(feedDir, STORE_FILE) });

  try {
    const rows = await db.query<{ day: string }>(
      `select strftime(day, '%Y-%m-%d') as day from ${STORE}.service_days where service_id = '${service}' order by day`,
    );
    return rows.map(row => row.day);
  } finally {
    db.close();
  }
}

afterEach(async () => {
  logged.length = 0;
  await Promise.all(
    directories.splice(0).map(dir => rm(dir, { force: true, recursive: true })),
  );
});

describe('expandCalendar', () => {
  it('reads the feed year from feed_info.txt and names the reference week inside it', async () => {
    const calendar = await expandCalendar(await writeFeed(), log);

    expect(calendar.window).toEqual({ first: '2025-12-14', last: '2026-12-12' });
    expect(calendar.referenceWeek).toEqual({ first: '2026-09-07', last: '2026-09-13' });
    expect(logged).toContain(
      'trips per week are counted over the reference week, 2026-09-07 to 2026-09-13',
    );
  });

  it('shows a summer-only mountain line running from June to October', async () => {
    const { routes } = await expandCalendar(await writeFeed(), log);

    expect(routes.find(route => route.routeId === '93-68-j26-1')).toEqual({
      routeId: '93-68-j26-1',
      serviceDays: 135,
      firstDate: '2026-06-13',
      lastDate: '2026-10-25',
    });
  });

  it('lets an exception win over the weekday pattern in both directions', async () => {
    const feedDir = await writeFeed();
    const { routes } = await expandCalendar(feedDir, log);
    const fridays = await storedDays(feedDir, 'TA+00000');

    // The 19th and 26th are Fridays taken out; the 27th is a Saturday put in.
    expect(fridays.slice(0, 3)).toEqual(['2025-12-27', '2026-01-02', '2026-01-09']);
    expect(fridays.at(-1)).toBe('2026-12-11');
    expect(routes.find(route => route.routeId === '92-fri-j26-1')).toMatchObject({
      serviceDays: 52 - 2 + 1,
      firstDate: '2025-12-27',
    });
  });

  it('counts a day two of a route’s services share once', async () => {
    const { routes } = await expandCalendar(await writeFeed(), log);

    expect(routes.find(route => route.routeId === '91-10-A-j26-1')).toMatchObject({
      serviceDays: 364,
    });
  });

  it('clips patterns and additions to the feed year', async () => {
    const feedDir = await writeFeed();
    const { routes } = await expandCalendar(feedDir, log);

    expect(routes.find(route => route.routeId === '92-wide-j26-1')).toEqual({
      routeId: '92-wide-j26-1',
      serviceDays: 364,
      firstDate: '2025-12-14',
      lastDate: '2026-12-12',
    });
    expect(await storedDays(feedDir, 'TA+added0')).toEqual(['2026-08-01']);
  });

  it('keeps a route that runs on no day, and reports services nothing defines', async () => {
    const calendar = await expandCalendar(await writeFeed(), log);

    expect(calendar.routes.map(route => route.routeId)).toEqual([
      '91-10-A-j26-1',
      '92-added-j26-1',
      '92-fri-j26-1',
      '92-lost-j26-1',
      '92-never-j26-1',
      '92-wide-j26-1',
      '93-68-j26-1',
    ]);
    expect(calendar.routes.find(route => route.routeId === '92-never-j26-1')).toEqual({
      routeId: '92-never-j26-1',
      serviceDays: 0,
      firstDate: null,
      lastDate: null,
    });
    expect(calendar.unresolved).toBe(1);
    expect(logged).toContain('2 routes run on no day of the feed year');
    expect(logged).toContain(
      '1 services that trips run on are in neither calendar file; their trips count as running on no day',
    );
  });

  it('replaces the stored table on a second run instead of adding to it', async () => {
    const feedDir = await writeFeed();
    const first = await expandCalendar(feedDir, log);
    const second = await expandCalendar(feedDir, log);

    expect(second.serviceDays).toBe(first.serviceDays);
    expect(second.routes).toEqual(first.routes);
  });

  it('names the file and the column a mirror does not carry', async () => {
    const feedDir = await writeFeed({
      calendar: `service_id,monday,tuesday,wednesday,thursday,friday,saturday,start_date,end_date
"TA","1","1","1","1","1","1","20251214","20261212"
`,
    });

    await expect(expandCalendar(feedDir, log)).rejects.toThrow(
      'calendar.txt is missing sunday; rerun pnpm recon:data to see what the feed does carry',
    );
  });

  it('refuses a feed_info.txt that gives two periods', async () => {
    const feedDir = await writeFeed({
      feed_info: `${FEED_INFO}"SBB","https://sbb.ch","FR","20251214","20261211","20260919"
`,
    });

    await expect(expandCalendar(feedDir, log)).rejects.toThrow(
      'feed_info.txt has 2 different periods; the feed year has to be one period',
    );
  });

  it('fails when nothing runs on any day, rather than handing on an empty table', async () => {
    const feedDir = await writeFeed({
      calendar: `service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date
"TA+never0","0","0","0","0","0","0","0","20251214","20261212"
`,
      calendar_dates: `service_id,date,exception_type
`,
    });

    await expect(expandCalendar(feedDir, log)).rejects.toThrow(
      /yielded no service days between 2025-12-14 and 2026-12-12/,
    );
  });
});
