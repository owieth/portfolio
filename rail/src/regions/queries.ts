/**
 * What the regions step asks of the feed, as SQL.
 *
 * It lives apart from the step that runs it so it can be executed against a
 * handwritten fixture in a test, the same arrangement as `stations/queries.ts`.
 *
 * The join from a route to the stations it serves runs through the ingested
 * `stop_times` in the store rather than the 3 GB CSV, which is what the ingest
 * step is for. Only the routes the allowlist kept are joined — 676 of 5,170 —
 * so the buses never leave DuckDB.
 */

import { literal, STORE } from '../db.ts';

/**
 * The allowlist's verdict, handed to DuckDB as a table. The decision stays in
 * `allowlist/categories.ts`; restating it as a `where` clause here would give it
 * a second home.
 */
export function allowed(routeIds: readonly string[]): string {
  const rows = routeIds.map(routeId => `(${literal(routeId)})`).join(', ');

  return `create table allowed as select * from (values ${rows}) as allowed(route_id)`;
}

/**
 * Every platform row in `stops.txt` carries its station's Didok number, so the
 * collapse to stations the stations step does through `parent_station` is a
 * plain column read here.
 *
 * A stop the train passes without serving is `pickup_type` and `drop_off_type`
 * both `1`. It is not a station of the line — a route through Zürich HB that
 * does not stop there must not be filed under Zürich.
 *
 * `order by` is total, so the sets every route is matched against are built in
 * the same order on every run.
 */
export const SERVED = `
  select distinct trips.route_id as route_id, stops.didok as didok
  from allowed
  join trips on trips.route_id = allowed.route_id
  join ${STORE}.stop_times as stop_times on stop_times.trip_id = trips.trip_id
  join stops on stops.stop_id = stop_times.stop_id
  where not (stop_times.pickup_type = '1' and stop_times.drop_off_type = '1')
    and coalesce(stops.didok, '') <> ''
  order by route_id, didok
`;

export interface ServedRow {
  route_id: string;
  didok: string;
}

/**
 * One name per Didok number, for checking the names the rules were written
 * with. The station row's own name where there is one, since a platform can
 * carry a name the station does not.
 */
export const STATION_NAMES = `
  select didok, arg_min(stop_name, coalesce(location_type, '') <> '1') as name
  from stops
  where coalesce(didok, '') <> ''
  group by didok
  order by didok
`;

export interface NameRow {
  didok: string;
  name: string;
}

export const AGENCIES = `
  select agency_id, agency_name
  from agency
  order by agency_id
`;

export interface AgencyRow {
  agency_id: string;
  agency_name: string;
}
