/**
 * What the termini step asks of the store, `stops.txt` and `trips.txt`, as SQL.
 *
 * It lives apart from the step that runs it so it can be executed against a
 * handwritten fixture in a test, the same arrangement as `seasonal/queries.ts`.
 *
 * The patterns were cut at the border on purpose, so the one thing they cannot
 * say is where an international train actually goes. That is back in
 * `store.stop_times`, which still has every stop of every trip, and like the
 * patterns step this reads it in one statement and hands back a few thousand
 * rows rather than millions.
 */

import { STORE } from '../db.ts';
import type { GtfsFile } from '../db.ts';

/**
 * Checked by name before anything runs, so a mirror that re-derives the feed
 * without one of them arrives as a sentence rather than as a binder error.
 */
export const REQUIRED_COLUMNS = {
  trips: ['trip_id', 'route_id', 'service_id'],
  stops: ['stop_id', 'stop_name', 'parent_station', 'didok'],
} as const satisfies Partial<Record<GtfsFile, readonly string[]>>;

export type TerminiFile = keyof typeof REQUIRED_COLUMNS;

export function columns(file: TerminiFile): string {
  return `select column_name from (describe ${file})`;
}

export interface ColumnRow {
  column_name: string;
}

/** The store tables this step reads, written by the ingest and calendar steps. */
export const STORE_TABLES = ['stop_times', 'service_days'] as const;

export const TABLES = `
  select table_name
  from information_schema.tables
  where table_catalog = '${STORE}'
`;

export interface TableRow {
  table_name: string;
}

/**
 * Per line, per Swiss end a trip leaves the country at, every station its trips
 * really end at on that side, with how often.
 *
 * - A stop is its station and a stop the train only passes is left out, the
 *   same two rules the patterns step applies, so the Swiss ends here are the
 *   ends of the trip's pattern.
 * - `swiss_end` is the first or last Swiss station a trip serves, and
 *   `true_didok` the first or last station it serves at all, on the same side.
 *   For a trip that stays in Switzerland the two are the same station. For an
 *   EC to Milano they are Chiasso and Milano Centrale.
 * - A trip that serves fewer than two Swiss stations made no pattern, so it is
 *   not part of any line's sequence and is left out here too.
 * - `runs` weights each trip by the days its service runs in the feed year, the
 *   same weight the patterns carry, so the busiest end wins rather than the one
 *   spread over the most `trip_id`s.
 *
 * The name comes from `stops.txt` rather than from the stations step, because
 * that step keeps only the Swiss stations and a true terminus is usually not
 * one. `min` rather than any value, so two stops of one station that spell it
 * differently still give one name on every run.
 *
 * Expects the `line_routes` table from `seasonal/queries.ts` and the `swiss`
 * table from `patterns/queries.ts` to exist on the connection.
 */
export const TRUE_ENDS = `
  with
    line_trips as (
      select line_routes.line_id, trips.trip_id, trips.service_id
      from trips
      join line_routes on line_routes.route_id = trips.route_id
    ),
    stop_station as (
      select
        stop.stop_id,
        coalesce(parent.didok, stop.didok) as didok,
        coalesce(parent.stop_name, stop.stop_name) as name
      from stops as stop
      left join stops as parent on parent.stop_id = stop.parent_station
    ),
    served as (
      select
        line_trips.line_id,
        line_trips.trip_id,
        line_trips.service_id,
        stop_times.stop_sequence,
        stop_station.didok,
        stop_station.name,
        swiss.didok is not null as swiss
      from ${STORE}.stop_times as stop_times
      join line_trips on line_trips.trip_id = stop_times.trip_id
      join stop_station on stop_station.stop_id = stop_times.stop_id
      left join swiss on swiss.didok = stop_station.didok
      where not (stop_times.pickup_type = '1' and stop_times.drop_off_type = '1')
    ),
    trip_ends as (
      select
        line_id,
        service_id,
        arg_min(didok, stop_sequence) as first_didok,
        arg_min(name, stop_sequence) as first_name,
        arg_max(didok, stop_sequence) as last_didok,
        arg_max(name, stop_sequence) as last_name,
        arg_min(didok, stop_sequence) filter (where swiss) as swiss_first,
        arg_max(didok, stop_sequence) filter (where swiss) as swiss_last
      from served
      group by line_id, trip_id, service_id
      having count(distinct didok) filter (where swiss) >= 2
    ),
    sides as (
      select line_id, service_id, swiss_first as swiss_end, first_didok as true_didok, first_name as true_name
      from trip_ends
      union all
      select line_id, service_id, swiss_last, last_didok, last_name
      from trip_ends
    ),
    service_weights as (
      select service_id, count(*)::integer as days
      from ${STORE}.service_days
      group by service_id
    )
  select
    sides.line_id as line_id,
    sides.swiss_end as swiss_end,
    sides.true_didok as true_didok,
    min(sides.true_name) as true_name,
    count(*)::integer as trips,
    coalesce(sum(service_weights.days), 0)::integer as runs
  from sides
  left join service_weights on service_weights.service_id = sides.service_id
  group by sides.line_id, sides.swiss_end, sides.true_didok
  order by line_id, swiss_end, true_didok
`;

export interface TrueEndRow {
  line_id: string;
  swiss_end: string;
  true_didok: string;
  true_name: string;
  trips: number;
  runs: number;
}
