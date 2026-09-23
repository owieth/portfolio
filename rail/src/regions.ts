/**
 * Step seven: file every rideable route under the network it belongs to.
 *
 * A line is `(category, number, region)`, and the region is the part the feed
 * does not publish. `S1` is five different lines in the 2026 feed — Basel,
 * Bern, Luzern, Chur and the Ostwind S1 from Wil to Schaffhausen — and three of
 * them are SBB's, so the operator cannot be the region either. What tells them
 * apart is where they stop, which is why this step reads the ingested stop times
 * rather than `routes.txt` alone.
 *
 * The decision is `data/regions.json`, applied by `regions/rules.ts`. This file
 * opens the feed, works out which stations each route serves, applies the rules
 * and counts. A route no rule places falls back to its operator's slug and is
 * listed, because a route in the wrong region merges into the wrong line and
 * nothing downstream would notice.
 */

import { join } from 'node:path';

import type { AllowedRoute } from './allowlist.ts';
import { lineNumber } from './allowlist/categories.ts';
import { openGtfs } from './db.ts';
import { gtfsPath } from './fetch/record.ts';
import { STORE_FILE } from './ingest.ts';
import { AGENCIES, allowed, SERVED, STATION_NAMES } from './regions/queries.ts';
import type { AgencyRow, NameRow, ServedRow } from './regions/queries.ts';
import { assign, loadRules, operatorSlug, RULES_FILE, verify } from './regions/rules.ts';
import type { Rule } from './regions/rules.ts';

export interface RegionedRoute extends AllowedRoute {
  /** The operator's name from `agency.txt`, or its id when the feed names none. */
  operator: string;
  region: string;
  /**
   * `rule` for a named region, `operator` for a rule that files the route under
   * its operator on purpose, `fallback` for a route no rule placed.
   */
  source: 'rule' | 'operator' | 'fallback';
}

export interface Unassigned {
  routeId: string;
  category: string;
  shortName: string | null;
  operator: string;
  /** The operator slug the route was filed under instead. */
  region: string;
}

export interface Tally {
  region: string;
  name: string;
  routes: number;
}

export interface Regions {
  /** In the allowlist's order, which is `route_id` order. */
  routes: RegionedRoute[];
  /** For the report: the routes no rule placed. Short is the goal, empty the ideal. */
  unassigned: Unassigned[];
  /** Routes per region, busiest first. */
  regions: Tally[];
}

type Log = (message: string) => void;

function count(value: number): string {
  return value.toLocaleString('en-US');
}

function plural(value: number, noun: string): string {
  return `${count(value)} ${value === 1 ? noun : `${noun}s`}`;
}

function describeRule(rule: Rule, position: number): string {
  return `rule ${position} (${rule.region ?? 'by operator'})`;
}

/**
 * Grouped once rather than filtered per route: 676 routes against a list of
 * some tens of thousands of `(route, station)` pairs.
 */
function stationsByRoute(rows: ServedRow[]): Map<string, Set<string>> {
  const served = new Map<string, Set<string>>();

  for (const row of rows) {
    const stations = served.get(row.route_id) ?? new Set<string>();
    stations.add(row.didok);
    served.set(row.route_id, stations);
  }

  return served;
}

/**
 * Sorted by route count and then by slug, never by insertion order: the log is
 * read against the previous run's log, and rows swapping places would be noise.
 */
function tallies(routes: RegionedRoute[], names: Map<string, string>): Tally[] {
  const counts = new Map<string, number>();

  for (const route of routes) {
    counts.set(route.region, (counts.get(route.region) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([region, routes]) => ({ region, name: names.get(region) ?? region, routes }))
    .sort((a, b) => b.routes - a.routes || a.region.localeCompare(b.region));
}

/**
 * How many line numbers appear in more than one region — the collisions the
 * region exists to keep apart, and the number to watch between Decembers.
 */
function recurring(routes: RegionedRoute[]): { numbers: number; widest: string } {
  const regionsByNumber = new Map<string, Set<string>>();

  for (const route of routes) {
    const number = lineNumber(route.shortName, route.category);

    if (number === null) {
      continue;
    }

    const regions = regionsByNumber.get(number) ?? new Set<string>();
    regions.add(route.region);
    regionsByNumber.set(number, regions);
  }

  const shared = [...regionsByNumber.entries()]
    .filter(([, regions]) => regions.size > 1)
    .sort(([a, x], [b, y]) => y.size - x.size || a.localeCompare(b));

  const [first] = shared;

  return {
    numbers: shared.length,
    widest: first === undefined ? '' : `${first[0]} in ${first[1].size}`,
  };
}

/**
 * Takes the feed directory, like the ingest step, because it reads the stop
 * times that step wrote into the feed's store. The rules path is a parameter so
 * a test can hand it a rule file it wrote itself.
 */
export async function assignRegions(
  feedDir: string,
  routes: readonly AllowedRoute[],
  log: Log,
  rulesPath: string = RULES_FILE,
): Promise<Regions> {
  const { regions: regionNames, rules } = await loadRules(rulesPath);

  // After the rules rather than alongside them: a malformed rule file should fail
  // before there is a database open for it to leak.
  // react-doctor-disable-next-line react-doctor/server-sequential-independent-await
  const db = await openGtfs(gtfsPath(feedDir), ['agency', 'stops', 'trips'], {
    store: join(feedDir, STORE_FILE),
  });

  try {
    await db.run(allowed(routes.map(route => route.routeId)));

    const [served, stationNames, agencies] = await Promise.all([
      db.query<ServedRow>(SERVED),
      db.query<NameRow>(STATION_NAMES),
      db.query<AgencyRow>(AGENCIES),
    ]);

    const agencyNames = new Map(agencies.map(row => [row.agency_id, row.agency_name]));

    for (const problem of verify(rules, {
      stations: new Map(stationNames.map(row => [row.didok, row.name])),
      agencies: agencyNames,
    })) {
      log(`${problem}; fix data/regions.json`);
    }

    const stations = stationsByRoute(served);
    const names = new Map(Object.entries(regionNames));
    const matched = new Set<number>();
    const regioned: RegionedRoute[] = [];
    const unassigned: Unassigned[] = [];

    for (const route of routes) {
      const operator =
        (route.agencyId === null ? undefined : agencyNames.get(route.agencyId)) ??
        route.agencyId ??
        'unknown operator';
      const match = assign(
        {
          category: route.category,
          agencyId: route.agencyId,
          shortName: route.shortName,
          stations: stations.get(route.routeId) ?? new Set(),
        },
        rules,
      );

      if (match !== null) {
        matched.add(match.position);
      }

      if (match?.rule.region !== undefined) {
        regioned.push({ ...route, operator, region: match.rule.region, source: 'rule' });
        continue;
      }

      const region = operatorSlug(operator);
      names.set(region, operator);

      if (match !== null) {
        regioned.push({ ...route, operator, region, source: 'operator' });
        continue;
      }

      regioned.push({ ...route, operator, region, source: 'fallback' });
      unassigned.push({
        routeId: route.routeId,
        category: route.category,
        shortName: route.shortName,
        operator,
        region,
      });
    }

    const placed = regioned.filter(route => route.source === 'rule');
    const byOperator = regioned.filter(route => route.source === 'operator').length;
    const named = new Set(placed.map(route => route.region)).size;

    log(
      `${count(placed.length)} of ${count(regioned.length)} routes placed in ${plural(named, 'region')} by ${plural(rules.length, 'rule')}, ${count(byOperator)} filed under their operator, ${count(unassigned.length)} unassigned`,
    );

    const { numbers, widest } = recurring(regioned);

    if (numbers > 0) {
      log(
        `${plural(numbers, 'line number')} recur across regions, ${widest} — the collisions the region keeps apart`,
      );
    }

    for (const [index, rule] of rules.entries()) {
      if (!matched.has(index + 1)) {
        log(
          `${describeRule(rule, index + 1)} matched no route in this feed; it may be stale`,
        );
      }
    }

    for (const route of unassigned) {
      log(
        `route ${route.routeId} ${route.shortName ?? route.category} by ${route.operator} matched no rule — filed under ${route.region}; add a rule to data/regions.json`,
      );
    }

    return { routes: regioned, unassigned, regions: tallies(regioned, names) };
  } finally {
    db.close();
  }
}
