/**
 * Step five: expand the calendar into the days each service actually runs, and
 * name the week that trips are counted over.
 *
 * Two later steps count trips, and neither can do it from `calendar.txt` rows.
 * The seasonal flag needs to know how many days of the feed year a line runs on,
 * and a summer-only mountain line is a weekday pattern from December to December
 * with every day from November to May removed in `calendar_dates.txt`. The stop
 * patterns need a trip weighted by the days it runs, which is the same question.
 *
 * So this step writes `service_days` — one row per service per day it runs, in
 * the feed year — into the feed's store, where the later steps join against it,
 * and hands back the per-route summary and the reference week in memory.
 *
 * Takes the feed directory rather than the `gtfsDir` for the reason `ingest.ts`
 * gives: it writes as well as reads, and the store belongs beside `gtfs.zip`.
 */

import { join, relative } from 'node:path';

import { openGtfs } from './db.ts';
import type { Gtfs } from './db.ts';
import {
  REQUIRED_COLUMNS,
  ROUTE_SERVICE,
  TOTALS,
  UNRESOLVED,
  WINDOW,
  columns,
  serviceDays,
} from './calendar/queries.ts';
import type {
  CalendarFile,
  ColumnRow,
  RouteServiceRow,
  TotalsRow,
  UnresolvedRow,
  WindowRow,
} from './calendar/queries.ts';
import { referenceWeek } from './calendar/week.ts';
import type { DateRange } from './calendar/week.ts';
import { gtfsPath } from './fetch/record.ts';
import { STORE_FILE } from './ingest.ts';
import { RAIL_DIR } from './paths.ts';

export interface RouteService {
  routeId: string;
  /** Distinct days in the feed year that at least one of its trips runs. */
  serviceDays: number;
  /** ISO dates; `null` when the route runs on no day of the feed year. */
  firstDate: string | null;
  lastDate: string | null;
}

export interface Calendar {
  /** The feed year, from `feed_info.txt`. */
  window: DateRange;
  /** The week `trips_per_week` is counted over — see `calendar/week.ts`. */
  referenceWeek: DateRange;
  /** Every route with trips, ordered by `route_id`. */
  routes: RouteService[];
  /** Rows in `store.service_days`. */
  serviceDays: number;
  /** Services with at least one day. */
  services: number;
  /** Services trips run on that neither calendar file defines. */
  unresolved: number;
  elapsedMs: number;
}

type Log = (message: string) => void;

function count(value: number): string {
  return value.toLocaleString('en-US');
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function here(path: string): string {
  return relative(RAIL_DIR, path);
}

/**
 * The geOps mirror re-derives the feed, and a column it does not carry has to
 * arrive as a sentence naming the file rather than as a binder error from inside
 * a query over eleven million rows.
 */
async function assertColumns(db: Gtfs): Promise<void> {
  const files = Object.keys(REQUIRED_COLUMNS) as CalendarFile[];

  const missing = await Promise.all(
    files.map(async file => {
      const present = new Set(
        (await db.query<ColumnRow>(columns(file))).map(row => row.column_name),
      );
      const absent = REQUIRED_COLUMNS[file].filter(column => !present.has(column));
      return absent.length === 0 ? null : `${file}.txt is missing ${absent.join(', ')}`;
    }),
  );

  const sentences = missing.filter(sentence => sentence !== null);

  if (sentences.length > 0) {
    throw new Error(
      `${sentences.join('; ')}; rerun pnpm recon:data to see what the feed does carry`,
    );
  }
}

/**
 * Exactly one row, with both dates readable. GTFS allows `feed_info.txt` a row
 * per language; the Swiss feed has one, and a second row that disagreed about
 * the period would leave the feed year undefined rather than merely ambiguous.
 */
async function feedWindow(db: Gtfs): Promise<DateRange> {
  const rows = await db.query<WindowRow>(WINDOW);
  const periods = new Set(rows.map(row => `${row.first}/${row.last}`));
  const [row] = rows;

  if (row === undefined || periods.size !== 1) {
    throw new Error(
      `feed_info.txt has ${rows.length === 0 ? 'no rows' : `${periods.size} different periods`}; the feed year has to be one period`,
    );
  }

  if (row.first === null || row.last === null || row.first > row.last) {
    throw new Error(
      `feed_info.txt gives no readable period (feed_start_date to feed_end_date); expected two YYYYMMDD dates in order`,
    );
  }

  return { first: row.first, last: row.last };
}

function toRoute(row: RouteServiceRow): RouteService {
  return {
    routeId: row.route_id,
    serviceDays: row.service_days,
    firstDate: row.first_date,
    lastDate: row.last_date,
  };
}

export async function expandCalendar(feedDir: string, log: Log): Promise<Calendar> {
  const store = join(feedDir, STORE_FILE);
  const db = await openGtfs(
    gtfsPath(feedDir),
    ['calendar', 'calendar_dates', 'feed_info', 'trips'],
    { store },
  );

  try {
    await assertColumns(db);

    const window = await feedWindow(db);
    // Before the expansion rather than after it, so a feed that cannot name the
    // week fails in milliseconds instead of after the expensive part.
    const week = referenceWeek(window);

    const startedAt = performance.now();

    await db.run(serviceDays(window));

    // Sequential: each is a scan of the table or of trips.txt, and DuckDB already
    // parallelises inside a query — two at once would only compete for the pool.
    const [totals] = await db.query<TotalsRow>(TOTALS);
    const routes = (await db.query<RouteServiceRow>(ROUTE_SERVICE)).map(toRoute);
    const [unresolved] = await db.query<UnresolvedRow>(UNRESOLVED);

    const elapsedMs = performance.now() - startedAt;
    const { rows, services } = totals ?? { rows: 0, services: 0 };

    // No service days at all means the calendar did not parse into anything, and
    // an empty table would hand every later step a feed in which nothing runs.
    if (rows === 0) {
      throw new Error(
        `calendar.txt and calendar_dates.txt yielded no service days between ${window.first} and ${window.last}; delete the feed directory and rerun`,
      );
    }

    const idle = routes.filter(route => route.serviceDays === 0).length;

    log(
      `${count(rows)} service days over ${count(services)} services into ${here(store)}, for the feed year ${window.first} to ${window.last} — ${seconds(elapsedMs)}`,
    );
    log(
      `${count(routes.length - idle)} of ${count(routes.length)} routes run on at least one day of it`,
    );

    // A route whose services all fall outside the feed year is legitimate —
    // a construction replacement that ended before it began — but it is also
    // what a misread calendar looks like, so it is counted rather than dropped.
    if (idle > 0) {
      log(`${count(idle)} routes run on no day of the feed year`);
    }

    const missing = unresolved?.services ?? 0;

    if (missing > 0) {
      log(
        `${count(missing)} services that trips run on are in neither calendar file; their trips count as running on no day`,
      );
    }

    log(`trips per week are counted over the reference week, ${week.first} to ${week.last}`);

    return {
      window,
      referenceWeek: week,
      routes,
      serviceDays: rows,
      services,
      unresolved: missing,
      elapsedMs,
    };
  } finally {
    db.close();
  }
}
