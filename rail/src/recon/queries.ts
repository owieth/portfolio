/**
 * The questions #467 asks of `routes.txt`, as SQL.
 *
 * They live apart from the step that runs them so they can be executed against a
 * handwritten fixture in a test. The real feed is 256 MB and only exists on a
 * machine that has run `pnpm build:data`, which is not a thing a test may assume.
 *
 * Every query is a plain string rather than a builder. The recon is a fixed set
 * of questions asked once, not a query language, and a string is the version a
 * reader can paste into a DuckDB shell when they want to check an answer.
 *
 * Each `order by` ends on a column that cannot tie — a `route_id`, an
 * `agency_id`. DuckDB scans in parallel and breaks a tie differently from one
 * run to the next, and `RECON.md` is committed: without a total ordering, two
 * runs over the same feed produce a diff of rows swapping places.
 */

/**
 * The brief's proposed include set, written as a predicate so the report can be
 * explicit about what it did and did not look at. Recon exists to test this
 * guess, so it appears here as a guess and nowhere as a fact.
 */
export const RAIL_CANDIDATE = `(
  try_cast(route_type as integer) between 100 and 199
  or route_type = '1400'
)`;

/** The category codes the brief names as "only a category", plus what the feed turned out to hold. */
export const CATEGORY_ONLY = `route_short_name = route_desc`;

export interface CombinationRow {
  route_type: string;
  route_desc: string | null;
  agency_id: string | null;
  agency_name: string | null;
  routes: number;
  trips: number;
}

/**
 * The first question: distinct `(route_type, route_desc, agency_id)` with route
 * and trip counts. Restricted to the candidate set — the whole feed is 679
 * combinations, most of them bus operators, and `CATEGORIES` below covers those
 * without turning the report into a phone book.
 */
export const COMBINATIONS = `
  select
    r.route_type,
    r.route_desc,
    r.agency_id,
    a.agency_name,
    count(distinct r.route_id)::integer as routes,
    count(t.trip_id)::integer as trips
  from routes r
  left join agency a on a.agency_id = r.agency_id
  left join trips t on t.route_id = r.route_id
  where ${RAIL_CANDIDATE}
  group by 1, 2, 3, 4
  order by trips desc, r.route_type, r.route_desc, a.agency_name, r.agency_id
`;

export interface CategoryRow {
  route_type: string;
  route_desc: string | null;
  routes: number;
  trips: number;
  agencies: number;
}

/** Every `(route_type, route_desc)` in the feed, so an excluded code is visible rather than absent. */
export const CATEGORIES = `
  select
    r.route_type,
    r.route_desc,
    count(distinct r.route_id)::integer as routes,
    count(t.trip_id)::integer as trips,
    count(distinct r.agency_id)::integer as agencies
  from routes r
  left join trips t on t.route_id = r.route_id
  group by 1, 2
  order by try_cast(r.route_type as integer), trips desc, r.route_desc
`;

export interface SampleRow {
  route_id: string;
  route_type: string;
  route_desc: string | null;
  route_short_name: string | null;
  route_long_name: string | null;
  agency_name: string | null;
  trip_short_name: string | null;
  headsigns: number;
  headsign: string | null;
  trips: number;
}

/**
 * The 20 samples the issue asks for. Ordered by trip count rather than sampled
 * at random, so the rows shown are the ones a modelling mistake would hurt most,
 * and so two runs of the same feed produce the same report.
 *
 * `route_long_name`, `trip_short_name` and `trip_headsign` ride along because
 * the question behind the sample is "what else could carry the line number".
 */
export const CATEGORY_ONLY_SAMPLES = `
  select
    r.route_id,
    r.route_type,
    r.route_desc,
    r.route_short_name,
    r.route_long_name,
    a.agency_name,
    min(t.trip_short_name) as trip_short_name,
    count(distinct t.trip_headsign)::integer as headsigns,
    min(t.trip_headsign) as headsign,
    count(t.trip_id)::integer as trips
  from routes r
  left join agency a on a.agency_id = r.agency_id
  left join trips t on t.route_id = r.route_id
  where ${RAIL_CANDIDATE} and ${CATEGORY_ONLY}
  group by 1, 2, 3, 4, 5, 6
  order by trips desc, r.route_id
  limit 20
`;

export interface AgencyRow {
  agency_id: string | null;
  agency_name: string | null;
  routes: number;
  category_only: number;
  long_name: number;
  distinct_short_names: number;
  trip_short_name_per_route: number;
  trips: number;
}

/**
 * Per agency, how each candidate field behaves. This is the evidence for "which
 * field actually carries the passenger-facing line number":
 *
 * - `category_only` — routes whose `route_short_name` is nothing but the category.
 * - `long_name` — routes with a populated `route_long_name`.
 * - `trip_short_name_per_route` — distinct `trip_short_name`s per route. A line
 *   number would be one; anything larger means the field is the train number.
 */
export const LINE_NUMBER_BY_AGENCY = `
  with per_route as (
    select
      r.agency_id,
      r.route_id,
      r.route_short_name,
      r.route_long_name,
      r.route_desc,
      count(t.trip_id)::integer as trips,
      count(distinct t.trip_short_name)::integer as trip_short_names
    from routes r
    left join trips t on t.route_id = r.route_id
    where ${RAIL_CANDIDATE}
    group by 1, 2, 3, 4, 5
  )
  select
    p.agency_id,
    a.agency_name,
    count(*)::integer as routes,
    sum(case when p.route_short_name = p.route_desc then 1 else 0 end)::integer as category_only,
    count(p.route_long_name)::integer as long_name,
    count(distinct p.route_short_name)::integer as distinct_short_names,
    round(avg(p.trip_short_names), 1) as trip_short_name_per_route,
    sum(p.trips)::integer as trips
  from per_route p
  left join agency a on a.agency_id = p.agency_id
  group by 1, 2
  order by trips desc, routes desc, a.agency_name, p.agency_id
`;

export interface LiftRow {
  route_type: string;
  route_desc: string | null;
  agency_name: string | null;
  route_short_name: string | null;
  route_id: string;
  trips: number;
}

/** Every funicular in the feed, named, for the Polybahn question and for #476's seed. */
export const FUNICULARS = `
  select
    r.route_type,
    r.route_desc,
    a.agency_name,
    r.route_short_name,
    r.route_id,
    count(t.trip_id)::integer as trips
  from routes r
  left join agency a on a.agency_id = r.agency_id
  left join trips t on t.route_id = r.route_id
  where r.route_type = '1400'
  group by 1, 2, 3, 4, 5
  order by a.agency_name, r.route_short_name, r.route_id
`;

/**
 * Aerial lifts whose operator name says "funicular" in any of the four languages
 * the feed uses. A Standseilbahn typed 1300 would surface here, which is the
 * only way to catch one — nothing else in `routes.txt` distinguishes a rail from
 * a rope.
 */
export const MISTYPED_FUNICULARS = `
  select
    r.route_type,
    r.route_desc,
    a.agency_name,
    r.route_short_name,
    r.route_id,
    count(t.trip_id)::integer as trips
  from routes r
  left join agency a on a.agency_id = r.agency_id
  left join trips t on t.route_id = r.route_id
  where r.route_type <> '1400'
    and regexp_matches(
      lower(coalesce(a.agency_name, '')),
      'standseil|drahtseil|funicul|funicol|seilbahn.*stand'
    )
  group by 1, 2, 3, 4, 5
  order by r.route_type, a.agency_name, r.route_id
`;

export interface VariantRow {
  y_variant: boolean;
  category_only: boolean;
  routes: number;
}

/**
 * `route_id` reads `91-<line>-<variant>-j26-1`, and the variant segment turned
 * out to be the feed's own marker for "this service has no line number". Asked
 * as a cross-tab rather than as a count, because the useful answer is not "how
 * many" but "does the marker ever disagree with the string test" — and a rule
 * with exceptions has to be reported as one.
 *
 * A `route_id` with no variant segment — `93-24-j26-1` — reads as not-`Y`, which
 * is the right answer: those are the ones that do carry a number.
 */
export const VARIANT_RULE = `
  select
    split_part(route_id, '-', 3) = 'Y' as y_variant,
    ${CATEGORY_ONLY} as category_only,
    count(*)::integer as routes
  from routes
  where ${RAIL_CANDIDATE}
  group by 1, 2
  order by 1 desc, 2 desc
`;

/** The routes that break the marker rule, so the report can name them rather than round them off. */
export const VARIANT_EXCEPTIONS = `
  select
    r.route_id,
    r.route_type,
    r.route_desc,
    r.route_short_name,
    r.route_long_name,
    a.agency_name,
    null as trip_short_name,
    0::integer as headsigns,
    null as headsign,
    0::integer as trips
  from routes r
  left join agency a on a.agency_id = r.agency_id
  where ${RAIL_CANDIDATE}
    and ${CATEGORY_ONLY}
    and split_part(r.route_id, '-', 3) <> 'Y'
  order by r.route_id
`;

export interface OperatorRow {
  agency_id: string | null;
  agency_name: string | null;
  route_types: string | null;
  routes: number;
}

/**
 * Presence check for a named funicular. Privately run ones are the plausible
 * omissions — a company with no cantonal transport concession has no obligation
 * to publish a timetable — so "is it in the feed at all" has to be asked by name.
 *
 * The parameter is interpolated rather than bound because the caller supplies it
 * from a constant list in this repo, and `escapeLike` keeps a name with a `%` or
 * an apostrophe from changing the query's shape.
 */
export function operatorSearch(needle: string): string {
  return `
    select
      a.agency_id,
      a.agency_name,
      string_agg(distinct r.route_type, ', ' order by r.route_type) as route_types,
      count(r.route_id)::integer as routes
    from agency a
    left join routes r on r.agency_id = a.agency_id
    where lower(a.agency_name) like '%${escapeLike(needle.toLowerCase())}%' escape '\\'
    group by 1, 2
    order by a.agency_name, a.agency_id
  `;
}

/** Doubles the quote for SQL and neutralises the two LIKE wildcards. */
export function escapeLike(value: string): string {
  return value.replaceAll("'", "''").replaceAll('%', '\\%').replaceAll('_', '\\_');
}
