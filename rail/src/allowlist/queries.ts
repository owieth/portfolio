/**
 * What the allowlist asks of `routes.txt`, as SQL.
 *
 * It lives apart from the step that runs it so it can be executed against a
 * handwritten fixture in a test. The real feed is 256 MB and only exists on a
 * machine that has run `pnpm build:data`, which is not a thing a test may assume.
 *
 * One query, and it filters nothing. The cut is a table in `categories.ts`, and
 * expressing it a second time as a `where` clause would give it two homes that
 * drift apart. `routes.txt` is 5,170 rows: reading all of them and deciding in
 * TypeScript costs nothing and keeps the decision in one file.
 *
 * `order by route_id` is total — no two routes share one — so the surviving set
 * and every count derived from it come out in the same order on every run.
 */

export interface RouteRow {
  route_id: string;
  agency_id: string | null;
  route_short_name: string | null;
  route_desc: string | null;
  route_type: string;
}

/** Every route in the feed, excluded ones included — the step counts what it drops. */
export const ROUTES = `
  select
    route_id,
    agency_id,
    route_short_name,
    route_desc,
    route_type
  from routes
  order by route_id
`;
