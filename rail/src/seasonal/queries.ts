/**
 * What the seasonal step asks of the store, `trips.txt` and `frequencies.txt`,
 * as SQL.
 *
 * It lives apart from the step that runs it so it can be executed against a
 * handwritten fixture in a test, the same arrangement as `calendar/queries.ts`.
 *
 * Both answers the step needs are counts over `store.service_days`, which holds
 * 4.6 million rows for the 2026 feed, so they are taken here and only one row per
 * line crosses into JavaScript.
 */

import { STORE } from '../db.ts';
import type { GtfsFile } from '../db.ts';
import type { DateRange } from '../calendar/week.ts';

/**
 * Checked by name before anything runs, so a mirror that re-derives the feed
 * without one of them arrives as a sentence rather than as a binder error.
 */
export const REQUIRED_COLUMNS = {
  trips: ['trip_id', 'route_id', 'service_id'],
  frequencies: ['trip_id', 'start_time', 'end_time', 'headway_secs'],
} as const satisfies Partial<Record<GtfsFile, readonly string[]>>;

export type SeasonalFile = keyof typeof REQUIRED_COLUMNS;

export function columns(file: SeasonalFile): string {
  return `select column_name from (describe ${file})`;
}

export interface ColumnRow {
  column_name: string;
}

/** The store table this step reads, written by the calendar step. */
export const STORE_TABLES = ['service_days'] as const;

export const TABLES = `
  select table_name
  from information_schema.tables
  where table_catalog = '${STORE}'
`;

export interface TableRow {
  table_name: string;
}

/** Single-quoted SQL literal, the same escaping `db.ts` uses for a path. */
function literal(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function list(values: readonly string[]): string {
  return `[${values.map(literal).join(', ')}]::varchar[]`;
}

export interface LineRoute {
  lineId: string;
  routeId: string;
}

/**
 * Which line each route was merged into. The merge is TypeScript that SQL cannot
 * call, so its answer is written into a temporary table here rather than
 * restated, the same arrangement as `keyTable` in `patterns/queries.ts`.
 *
 * Two lists unnested side by side, which DuckDB zips row by row, so an empty
 * line set is an empty table rather than a `values` clause with nothing in it.
 */
export function lineRoutes(pairs: readonly LineRoute[]): string {
  return `
    create or replace temp table line_routes as
    select distinct line_id, route_id
    from (
      select
        unnest(${list(pairs.map(pair => pair.lineId))}) as line_id,
        unnest(${list(pairs.map(pair => pair.routeId))}) as route_id
    )
  `;
}

/**
 * `HH:MM:SS` to seconds past midnight of the service day. The hour runs past 23
 * for a trip that leaves after midnight on the previous day's service, so this
 * is arithmetic on the parts rather than a cast to `time`, which would refuse
 * `25:10:00`. Anything that is not three parts of digits comes out `null`.
 */
function secondsOf(column: string): string {
  return `
    case when regexp_full_match(trim(${column}), '[0-9]{1,3}:[0-5][0-9]:[0-5][0-9]')
      then cast(split_part(trim(${column}), ':', 1) as integer) * 3600
         + cast(split_part(trim(${column}), ':', 2) as integer) * 60
         + cast(split_part(trim(${column}), ':', 3) as integer)
    end
  `;
}

/**
 * One row per `frequencies.txt` row, with its window in seconds and the number of
 * departures it stands for.
 *
 * A trip listed here is a template: its `stop_times.txt` rows give the running
 * times, and the window says how often it leaves — every `headway_secs` from
 * `start_time`, for as long as the departure is before `end_time`. That is
 * `ceil((end − start) / headway)` departures, whether `exact_times` is set or not;
 * the flag only says whether the departures keep to the second.
 *
 * `valid` is false for a row that cannot be counted: a time that does not parse,
 * a headway of zero or less, or a window that ends where it starts or before.
 * The step refuses to guess at those rather than count them as one trip.
 */
export const FREQUENCY_WINDOWS = `
  create or replace temp view frequency_windows as
  with parsed as (
    select
      trip_id,
      ${secondsOf('start_time')} as start_seconds,
      ${secondsOf('end_time')} as end_seconds,
      try_cast(trim(headway_secs) as integer) as headway
    from frequencies
  )
  select
    trip_id,
    start_seconds,
    end_seconds,
    headway,
    coalesce(headway > 0 and end_seconds > start_seconds, false) as valid,
    case when valid then ceil((end_seconds - start_seconds) / headway)::integer end as departures
  from parsed
`;

export const INVALID_FREQUENCIES = `
  select count(*)::integer as rows
  from frequency_windows
  where not valid
`;

export interface InvalidRow {
  rows: number;
}

/**
 * Per line, the numbers the step hands on:
 *
 * - `service_days`: distinct days of the feed year on which at least one trip of
 *   any of its routes runs. Distinct over the line, not summed over its routes:
 *   an `S10` run by three operators on the same day runs on one day.
 * - `service_weeks`: distinct weeks of the feed year with such a day, the weeks
 *   being seven-day blocks counted from the first day of the feed year, so the
 *   2026 feed is exactly 52 of them. Blocks rather than calendar weeks, because
 *   the feed year starts on a Sunday and a calendar week of one day would count
 *   the same as a full one.
 * - `trips_per_week`: every trip of its routes, times the days its service runs
 *   in the reference week, times its departures — one for an ordinary trip, the
 *   sum of its windows for a template in `frequencies.txt`. The template itself
 *   is not counted on top: it is the pattern the departures follow, not a
 *   departure of its own.
 *
 * `frequency_trips` counts the templates, so the log can say how much of the
 * number came out of `frequencies.txt`.
 *
 * Left-joined from the line set, so a line whose services never run in the feed
 * year comes out with zeroes rather than disappearing before anyone sees it.
 */
export function lineService(window: DateRange, week: DateRange): string {
  const start = `${literal(window.first)}::date`;
  const first = `${literal(week.first)}::date`;
  const last = `${literal(week.last)}::date`;

  return `
    with
      line_trips as (
        select line_routes.line_id, trips.trip_id, trips.service_id
        from trips
        join line_routes on line_routes.route_id = trips.route_id
      ),
      departures as (
        select trip_id, sum(departures)::integer as departures
        from frequency_windows
        group by trip_id
      ),
      week_days as (
        select service_id, count(*)::integer as days
        from ${STORE}.service_days
        where day between ${first} and ${last}
        group by service_id
      ),
      line_days as (
        select
          line_services.line_id,
          count(distinct service_days.day)::integer as service_days,
          count(distinct datediff('day', ${start}, service_days.day) // 7)::integer as service_weeks
        from (select distinct line_id, service_id from line_trips) as line_services
        join ${STORE}.service_days as service_days
          on service_days.service_id = line_services.service_id
        group by line_services.line_id
      ),
      line_week as (
        select
          line_trips.line_id,
          sum(coalesce(departures.departures, 1) * week_days.days)::integer as trips_per_week,
          count(departures.trip_id)::integer as frequency_trips
        from line_trips
        left join departures on departures.trip_id = line_trips.trip_id
        left join week_days on week_days.service_id = line_trips.service_id
        group by line_trips.line_id
      )
    select
      lines.line_id as line_id,
      coalesce(line_days.service_days, 0) as service_days,
      coalesce(line_days.service_weeks, 0) as service_weeks,
      coalesce(line_week.trips_per_week, 0) as trips_per_week,
      coalesce(line_week.frequency_trips, 0) as frequency_trips
    from (select distinct line_id from line_routes) as lines
    left join line_days on line_days.line_id = lines.line_id
    left join line_week on line_week.line_id = lines.line_id
    order by line_id
  `;
}

export interface LineServiceRow {
  line_id: string;
  service_days: number;
  service_weeks: number;
  trips_per_week: number;
  frequency_trips: number;
}
