/**
 * Step two: reduce the feed to the routes that count as rideable lines.
 *
 * 5,170 routes arrive and most of them are buses. What is left is the input to
 * every later step, so the cut has to be both narrow and legible — and the part
 * that matters is not what it keeps but what it says about what it drops. A
 * category the pipeline has never seen is counted and named rather than filtered
 * away, because the feed is republished every December and the first sign that
 * its vocabulary moved should be a line in this log, not a line missing from
 * `lines.csv` a year later.
 *
 * The cut itself is a table in `allowlist/categories.ts`. This file opens the
 * feed, applies it, and counts.
 */

import { openGtfs } from './db.ts';
import { CATEGORIES, classify } from './allowlist/categories.ts';
import type { Category } from './allowlist/categories.ts';
import { ROUTES } from './allowlist/queries.ts';
import type { RouteRow } from './allowlist/queries.ts';

/**
 * `route_desc` `ZUG` is one route, six trips, on SNCF. The recon read it as
 * literally "train" — a category carrying no category — but Zug is also a Swiss
 * city, and the feed settles neither reading. It rides on rails either way, so
 * it is included and called out here rather than decided by the filter. #475
 * has to name it whichever it turns out to be.
 */
const UNSPECIFIED_CATEGORY: Category = 'ZUG';

export interface AllowedRoute {
  routeId: string;
  agencyId: string | null;
  shortName: string | null;
  category: Category;
}

export interface Tally {
  routeType: string;
  routeDesc: string;
  routes: number;
  reason: string;
}

export interface Allowlist {
  routes: AllowedRoute[];
  /** Deliberately dropped, per `(route_type, route_desc)`, busiest first. */
  excluded: Tally[];
  /** Dropped because nothing recognised them. Empty is the expected state. */
  unknown: Tally[];
}

type Log = (message: string) => void;

function count(value: number): string {
  return value.toLocaleString('en-US');
}

/**
 * Sorted by route count and then by code, never by insertion order: the log is
 * read against the previous run's log, and rows swapping places would be noise.
 */
function tallies(counts: Map<string, Tally>): Tally[] {
  return [...counts.values()].sort(
    (a, b) => b.routes - a.routes || a.routeDesc.localeCompare(b.routeDesc),
  );
}

function bump(counts: Map<string, Tally>, row: RouteRow, reason: string): void {
  const routeDesc = row.route_desc?.trim().toUpperCase() ?? '';
  const key = `${row.route_type}\u0000${routeDesc}`;
  const seen = counts.get(key);

  if (seen === undefined) {
    counts.set(key, { routeType: row.route_type, routeDesc, routes: 1, reason });
    return;
  }

  seen.routes += 1;
}

/**
 * One line per `route_type` rather than one per code. A new code appearing under
 * a type that is already excluded wholesale — another bus flavour — is then a
 * change to an existing line rather than a new line nobody reads.
 */
function byRouteType(excluded: Tally[]): string[] {
  const groups = new Map<string, Tally[]>();

  for (const tally of excluded) {
    groups.set(tally.routeType, [...(groups.get(tally.routeType) ?? []), tally]);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => Number.parseInt(a, 10) - Number.parseInt(b, 10))
    .map(([routeType, rows]) => {
      const codes = rows.map(row => `${row.routeDesc} ${count(row.routes)}`).join(', ');
      return `excluded route_type ${routeType} — ${codes}`;
    });
}

/**
 * Takes the extracted feed directory rather than the `FetchedFeed` around it,
 * because `routes.txt` is all it reads and a test can then hand it a directory
 * it wrote itself instead of a stub of a download.
 */
export async function allowRoutes(gtfsDir: string, log: Log): Promise<Allowlist> {
  const db = await openGtfs(gtfsDir, ['routes']);

  try {
    const rows = await db.query<RouteRow>(ROUTES);

    const routes: AllowedRoute[] = [];
    const categories = new Map<Category, number>();
    const excluded = new Map<string, Tally>();
    const unknown = new Map<string, Tally>();

    for (const row of rows) {
      const verdict = classify(row.route_desc, row.route_type);

      if (verdict.kind === 'excluded') {
        bump(excluded, row, verdict.reason);
        continue;
      }

      if (verdict.kind === 'unknown') {
        bump(unknown, row, verdict.reason);
        continue;
      }

      routes.push({
        routeId: row.route_id,
        agencyId: row.agency_id,
        shortName: row.route_short_name,
        category: verdict.category,
      });

      categories.set(verdict.category, (categories.get(verdict.category) ?? 0) + 1);
    }

    if (routes.length === 0) {
      throw new Error(
        `no rideable routes survived the allowlist of ${count(rows.length)} routes; the feed's route_desc vocabulary has changed — rerun pnpm recon:data and update allowlist/categories.ts`,
      );
    }

    log(
      `${count(routes.length)} of ${count(rows.length)} routes are rideable, in ${categories.size} of ${Object.keys(CATEGORIES).length} categories`,
    );

    for (const line of byRouteType(tallies(excluded))) {
      log(line);
    }

    for (const tally of tallies(unknown)) {
      log(
        `unrecognised route_type ${tally.routeType} ${tally.routeDesc || '(blank)'} — ${count(tally.routes)} routes dropped, ${tally.reason}; rerun pnpm recon:data and update allowlist/categories.ts`,
      );
    }

    const unspecified = categories.get(UNSPECIFIED_CATEGORY) ?? 0;

    if (unspecified > 0) {
      log(
        `category ${UNSPECIFIED_CATEGORY} on ${count(unspecified)} ${unspecified === 1 ? 'route' : 'routes'} — the code names no category, so #475 has to work from the terminals`,
      );
    }

    return { routes, excluded: tallies(excluded), unknown: tallies(unknown) };
  } finally {
    db.close();
  }
}
