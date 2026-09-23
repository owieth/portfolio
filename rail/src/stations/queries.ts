/**
 * What the stations step asks of `stops.txt`, as SQL.
 *
 * It lives apart from the step that runs it so it can be executed against a
 * handwritten fixture in a test, the same arrangement as `allowlist/queries.ts`.
 *
 * The collapse is done here rather than in TypeScript because it is a join and a
 * group-by over 104,262 rows, which is the one thing DuckDB is in this pipeline
 * to do. The judgement that follows — Swiss or not — is not, and stays in
 * `switzerland.ts` where it can be read.
 *
 * `order by didok` is total: the 2026 feed has 35,521 stations and 35,521
 * distinct Didok numbers, so the output and every count taken from it come out
 * in the same order on every run.
 */

/**
 * The columns this step needs. `original_stop_id` and `didok` are Swiss-profile
 * extensions rather than core GTFS, so the step checks for them by name before
 * querying — the geOps mirror re-derives the feed with its own ids and a missing
 * column has to arrive as a sentence rather than as a SQL error.
 */
export const REQUIRED_COLUMNS = [
  'stop_id',
  'stop_name',
  'stop_lat',
  'stop_lon',
  'location_type',
  'parent_station',
  'original_stop_id',
  'didok',
] as const;

export const COLUMNS = `select column_name from (describe stops)`;

export interface ColumnRow {
  column_name: string;
}

export interface StationRow {
  didok: string;
  name: string;
  /** `try_cast`, so a blank or malformed coordinate arrives as `null` to be reported. */
  lat: number | null;
  lon: number | null;
  sloid: string | null;
  /**
   * Rows in `stops.txt` that collapse into this station. `0` for a standalone stop.
   * Cast to `integer` in the query on purpose: a DuckDB `bigint` comes back from
   * `getRowObjectsJson` as a string, and a count that is silently a string is a
   * count that breaks the first time something adds to it.
   */
  stops: number;
}

/**
 * A station is a row the feed marked `location_type` 1, plus the rare row that
 * is neither a station nor anyone's child — the 2026 feed has exactly one,
 * `ch:1:sloid:258` Bern Münsterplattform, which is a funicular terminus and
 * precisely the kind of stop this pipeline exists to find. Dropping the
 * unparented rows would have lost it.
 *
 * SLOID is `original_stop_id` when it is one, and null otherwise: the foreign
 * stations carry their bare Didok number in that column instead, and a station
 * whose SLOID is the string `8014228` would be a worse lie than one with none.
 */
export const STATIONS = `
  select
    station.didok as didok,
    station.stop_name as name,
    try_cast(station.stop_lat as double) as lat,
    try_cast(station.stop_lon as double) as lon,
    case
      when station.original_stop_id like 'ch:1:sloid:%' then station.original_stop_id
    end as sloid,
    cast(count(platform.stop_id) as integer) as stops
  from stops as station
  left join stops as platform on platform.parent_station = station.stop_id
  where coalesce(station.location_type, '') = '1'
     or coalesce(station.parent_station, '') = ''
  group by 1, 2, 3, 4, 5
  order by didok
`;
