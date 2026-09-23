/**
 * What the calendar step asks of `calendar.txt`, `calendar_dates.txt`,
 * `feed_info.txt` and `trips.txt`, as SQL.
 *
 * It lives apart from the step that runs it so it can be executed against a
 * handwritten fixture in a test, the same arrangement as `ingest/queries.ts`.
 *
 * GTFS describes when a service runs twice over: `calendar.txt` as a weekday
 * pattern between two dates, and `calendar_dates.txt` as single days added to or
 * removed from it. Neither answers "does it run on the 12th" on its own, and a
 * trip count taken from the first alone counts every public holiday as a
 * working day. So the two are expanded here into one row per service per day it
 * actually runs, which is the only shape a later step can count from.
 */

import { STORE } from '../db.ts';
import type { GtfsFile } from '../db.ts';
import type { DateRange } from './week.ts';

/**
 * Checked by name before anything is expanded, so a mirror that re-derives the
 * feed without one of them arrives as a sentence rather than as a binder error.
 */
export const REQUIRED_COLUMNS = {
  feed_info: ['feed_start_date', 'feed_end_date'],
  calendar: [
    'service_id',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
    'start_date',
    'end_date',
  ],
  calendar_dates: ['service_id', 'date', 'exception_type'],
  trips: ['route_id', 'service_id'],
} as const satisfies Partial<Record<GtfsFile, readonly string[]>>;

export type CalendarFile = keyof typeof REQUIRED_COLUMNS;

export function columns(file: CalendarFile): string {
  return `select column_name from (describe ${file})`;
}

export interface ColumnRow {
  column_name: string;
}

/**
 * The feed year is what `feed_info.txt` says it is, not the span of the calendar
 * rows. It is the one statement of the period both the official feed and the
 * geOps mirror carry — the DCAT `dct:temporal` in `feed.json` is null for the
 * mirror — and a service row reaching past it is describing a timetable this
 * feed does not publish.
 *
 * `try_strptime`, so a malformed date arrives as `null` for the step to name,
 * rather than as a conversion error with no file attached.
 */
export const WINDOW = `
  select
    strftime(try_strptime(feed_start_date, '%Y%m%d'), '%Y-%m-%d') as first,
    strftime(try_strptime(feed_end_date, '%Y%m%d'), '%Y-%m-%d') as last
  from feed_info
`;

export interface WindowRow {
  first: string | null;
  last: string | null;
}

/** Single-quoted SQL literal, the same escaping `db.ts` uses for a path. */
function literal(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/**
 * One row per service per day it runs, inside the feed year.
 *
 * The weekday pattern is laid over every day of the window, removals are taken
 * out, and additions are put back in — in that order, which is the GTFS rule: an
 * exception always wins over the pattern. The parentheses are not decoration;
 * without them the reading of `except` and `union` together is left to the
 * engine.
 *
 * An addition outside the window is dropped with the pattern days outside it, so
 * every row in the table is a day this feed actually publishes.
 *
 * `order by` for the determinism rule the rest of the pipeline follows: DuckDB
 * builds this in parallel and would otherwise store two runs in two orders.
 */
export function serviceDays(window: DateRange): string {
  const first = `${literal(window.first)}::date`;
  const last = `${literal(window.last)}::date`;

  return `
    create or replace table ${STORE}.service_days as
    with
      days as (
        select unnest(generate_series(${first}, ${last}, interval 1 day))::date as day
      ),
      pattern as (
        select calendar.service_id, days.day
        from calendar
        join days
          on days.day between strptime(calendar.start_date, '%Y%m%d')::date
                          and strptime(calendar.end_date, '%Y%m%d')::date
        where case isodow(days.day)
          when 1 then calendar.monday
          when 2 then calendar.tuesday
          when 3 then calendar.wednesday
          when 4 then calendar.thursday
          when 5 then calendar.friday
          when 6 then calendar.saturday
          when 7 then calendar.sunday
        end = '1'
      ),
      exceptions as (
        select service_id, strptime(date, '%Y%m%d')::date as day, exception_type
        from calendar_dates
      )
    select service_id, day
    from (
      (
        select service_id, day from pattern
        except
        select service_id, day from exceptions where exception_type = '2'
      )
      union
      select service_id, day
      from exceptions
      where exception_type = '1' and day between ${first} and ${last}
    )
    order by service_id, day
  `;
}

export const TOTALS = `
  select
    count(*)::integer as rows,
    count(distinct service_id)::integer as services
  from ${STORE}.service_days
`;

export interface TotalsRow {
  rows: number;
  services: number;
}

/**
 * Per `route_id`, over the union of the services its trips run on — a day two
 * of its services share is one day, not two, which is why this counts distinct
 * days rather than summing per-service counts.
 *
 * Left-joined, so a route whose services never run inside the window still comes
 * out, with zero days, instead of disappearing before anything can report it.
 */
export const ROUTE_SERVICE = `
  with route_services as (
    select distinct route_id, service_id from trips
  )
  select
    route_services.route_id as route_id,
    count(distinct service_days.day)::integer as service_days,
    strftime(min(service_days.day), '%Y-%m-%d') as first_date,
    strftime(max(service_days.day), '%Y-%m-%d') as last_date
  from route_services
  left join ${STORE}.service_days as service_days
    on service_days.service_id = route_services.service_id
  group by route_services.route_id
  order by route_id
`;

export interface RouteServiceRow {
  route_id: string;
  service_days: number;
  first_date: string | null;
  last_date: string | null;
}

/**
 * Services a trip runs on that neither calendar file defines. GTFS makes that an
 * invalid feed; the step reports it rather than guessing, because such a trip
 * contributes no service days and would otherwise just quietly count as none.
 */
export const UNRESOLVED = `
  select count(distinct trips.service_id)::integer as services
  from trips
  where not exists (
    select 1 from calendar where calendar.service_id = trips.service_id
  )
  and not exists (
    select 1 from calendar_dates where calendar_dates.service_id = trips.service_id
  )
`;

export interface UnresolvedRow {
  services: number;
}
