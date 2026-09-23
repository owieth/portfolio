/**
 * What the patterns step asks of the store, `stops.txt` and `trips.txt`, as SQL.
 *
 * It lives apart from the step that runs it so it can be executed against a
 * handwritten fixture in a test, the same arrangement as `calendar/queries.ts`.
 *
 * The whole derivation is one statement because every stage of it is a join or
 * a group-by over the 18 million rows of `store.stop_times`, and none of those
 * rows has any business crossing into JavaScript. What comes out is a few
 * thousand patterns, and that is all the step reads back.
 */

import { STORE } from '../db.ts';
import type { GtfsFile } from '../db.ts';

/**
 * Checked by name before anything runs, so a mirror that re-derives the feed
 * without one of them arrives as a sentence rather than as a binder error.
 * `didok` is a Swiss-profile extension, which is why the stations step checks
 * for it too.
 */
export const REQUIRED_COLUMNS = {
  trips: ['trip_id', 'route_id', 'service_id'],
  stops: ['stop_id', 'parent_station', 'didok'],
} as const satisfies Partial<Record<GtfsFile, readonly string[]>>;

export type PatternFile = keyof typeof REQUIRED_COLUMNS;

export function columns(file: PatternFile): string {
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

/** Single-quoted SQL literal, the same escaping `db.ts` uses for a path. */
function literal(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/**
 * The allowlist and the Swiss stations arrive from earlier steps as values, not
 * as tables, and the decisions behind them — `allowlist/categories.ts` and
 * `stations/switzerland.ts` — are TypeScript that SQL cannot call. So they are
 * written into temporary tables here instead of being restated as SQL, which
 * would give each rule a second home to drift from.
 *
 * Temporary, so they die with the connection and never reach the store.
 */
export function keyTable(
  name: 'allowed' | 'swiss',
  column: 'route_id' | 'didok',
  values: readonly string[],
): string {
  const list = values.map(literal).join(', ');

  return `
    create or replace temp table ${name} as
    select distinct unnest([${list}]::varchar[]) as ${column}
  `;
}

/**
 * One row per route per distinct ordered list of stations its trips serve.
 *
 * - A stop is its station: a platform becomes its `parent_station`, the same
 *   collapse the stations step makes, so Zürich HB track 3 and track 14 are one
 *   entry and two trips differing only in platform share a pattern.
 * - A stop the train passes without serving — pickup and drop-off both `1` — is
 *   not a stop you can ride to, and is left out.
 * - A foreign station is left out, so an EC to Milano is its Swiss stops. The
 *   stations step decides what is Swiss; this only joins against its answer.
 * - The same station twice in a row, which is what two platforms of one station
 *   look like once collapsed, is one visit. A loop that comes back to a station
 *   later keeps both visits: that is a different line, not a duplicate.
 * - A trip left with fewer than two stations has no segment to ride and makes
 *   no pattern; the step counts those.
 *
 * `pattern_hash` is a function of the station list and nothing else — no
 * `trip_id`, no `service_id`, no `route_id` — so the same stops in the same
 * order hash the same in every feed. Sixteen hex characters are 64 bits, and the
 * step checks that no two lists share one rather than trusting the arithmetic.
 *
 * `runs` weights each trip by the days its service runs in the feed year, so a
 * pattern that runs every day outranks one that runs on twelve Saturdays however
 * many `trip_id`s each is spread over.
 *
 * `order by route_id, pattern_hash` is total — the pair is the grouping key — so
 * two runs over the same feed store the same rows in the same order.
 */
export const PATTERNS = `
  create or replace table ${STORE}.patterns as
  with
    allowed_trips as (
      select trips.trip_id, trips.route_id, trips.service_id
      from trips
      semi join allowed on allowed.route_id = trips.route_id
    ),
    stop_station as (
      select stop.stop_id, coalesce(parent.didok, stop.didok) as didok
      from stops as stop
      left join stops as parent on parent.stop_id = stop.parent_station
    ),
    served as (
      select stop_times.trip_id, stop_times.stop_sequence, stop_station.didok
      from ${STORE}.stop_times as stop_times
      semi join allowed_trips on allowed_trips.trip_id = stop_times.trip_id
      join stop_station on stop_station.stop_id = stop_times.stop_id
      semi join swiss on swiss.didok = stop_station.didok
      where not (stop_times.pickup_type = '1' and stop_times.drop_off_type = '1')
    ),
    visits as (
      select
        trip_id,
        stop_sequence,
        didok,
        lag(didok) over (partition by trip_id order by stop_sequence) as previous
      from served
    ),
    trip_patterns as (
      select trip_id, list(didok order by stop_sequence) as stations
      from visits
      where previous is distinct from didok
      group by trip_id
      having count(*) >= 2
    ),
    service_weights as (
      select service_id, count(*)::integer as days
      from ${STORE}.service_days
      group by service_id
    )
  select
    allowed_trips.route_id as route_id,
    left(sha256(array_to_string(trip_patterns.stations, ' ')), 16) as pattern_hash,
    trip_patterns.stations as stations,
    count(*)::integer as trips,
    coalesce(sum(service_weights.days), 0)::integer as runs
  from trip_patterns
  join allowed_trips on allowed_trips.trip_id = trip_patterns.trip_id
  left join service_weights on service_weights.service_id = allowed_trips.service_id
  group by allowed_trips.route_id, trip_patterns.stations
  order by route_id, pattern_hash
`;

export const READ_PATTERNS = `
  select route_id, pattern_hash, stations, trips, runs
  from ${STORE}.patterns
  order by route_id, pattern_hash
`;

export interface PatternRow {
  route_id: string;
  pattern_hash: string;
  stations: string[];
  trips: number;
  runs: number;
}

/** Allowed trips, to set against the trips that made a pattern. */
export const ALLOWED_TRIPS = `
  select count(*)::integer as trips
  from trips
  semi join allowed on allowed.route_id = trips.route_id
`;

export interface TripsRow {
  trips: number;
}

/**
 * Stop times on allowed trips whose `stop_id` is not in `stops.txt` at all. GTFS
 * makes that an invalid feed; the join above would drop the stop without a word
 * and hand a later step a pattern with a hole in it, so it is counted instead.
 */
export const UNRESOLVED = `
  select count(*)::integer as stops
  from ${STORE}.stop_times as stop_times
  semi join (
    select trip_id from trips semi join allowed on allowed.route_id = trips.route_id
  ) as allowed_trips on allowed_trips.trip_id = stop_times.trip_id
  anti join stops on stops.stop_id = stop_times.stop_id
`;

export interface UnresolvedRow {
  stops: number;
}

/** A hash that stands for two different station lists. Empty is the only acceptable answer. */
export const COLLISIONS = `
  select pattern_hash
  from (select distinct pattern_hash, stations from ${STORE}.patterns)
  group by pattern_hash
  having count(*) > 1
  order by pattern_hash
`;

export interface CollisionRow {
  pattern_hash: string;
}

/**
 * One hash over every stored row, counts included, so two runs can be compared
 * by reading one line of each log. Aggregated in a fixed order, because
 * `string_agg` without one concatenates in whatever order the threads finish.
 */
export const FINGERPRINT = `
  select left(sha256(coalesce(string_agg(
    route_id || ':' || pattern_hash || ':' || trips || ':' || runs,
    '\n' order by route_id, pattern_hash
  ), '')), 16) as fingerprint
  from ${STORE}.patterns
`;

export interface FingerprintRow {
  fingerprint: string;
}
