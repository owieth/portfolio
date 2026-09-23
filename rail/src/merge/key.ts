/**
 * What makes two routes the same line, as pure functions over values.
 *
 * They live apart from the step so each decision can be tested on its own, with
 * nothing but arrays: which pattern stands for a route, which two stations are
 * its ends, what its id is, and whether a group of routes hangs together.
 *
 * Every comparison here is by UTF-16 code unit rather than `localeCompare`. An
 * id is compared byte for byte between two runs, and a collation that depends on
 * the ICU build and the machine's locale is a way for the same feed to sort
 * differently on two laptops.
 */

import type { Category } from '../allowlist/categories.ts';
import type { Pattern } from '../patterns.ts';

/** Code-unit order, for sorts whose output ends up in an id or a fingerprint. */
export function compare(a: string, b: string): number {
  if (a === b) {
    return 0;
  }

  return a < b ? -1 : 1;
}

/**
 * The pattern a route is known by: the one that runs most over the feed year,
 * then the one with the most trips, then the lowest hash. The last is arbitrary
 * but total, so a tie is broken the same way on every run.
 */
export function dominantPattern(patterns: readonly Pattern[]): Pattern | null {
  let best: Pattern | null = null;

  for (const pattern of patterns) {
    if (
      best === null ||
      pattern.runs > best.runs ||
      (pattern.runs === best.runs && pattern.trips > best.trips) ||
      (pattern.runs === best.runs &&
        pattern.trips === best.trips &&
        compare(pattern.hash, best.hash) < 0)
    ) {
      best = pattern;
    }
  }

  return best;
}

/**
 * The first and last station of a pattern, in Didok order rather than running
 * order, so Landquart–Davos and Davos–Landquart are one pair.
 */
export function terminals(pattern: Pattern): [string, string] {
  const first = pattern.stations[0] ?? '';
  const last = pattern.stations.at(-1) ?? first;

  return compare(first, last) <= 0 ? [first, last] : [last, first];
}

/**
 * What a line number may contain once it is part of an id. `:` separates the
 * parts of the id, so a number carrying one could spell another line's id; the
 * rest keeps an id something a URL and a CSV cell take without quoting.
 */
const NUMBER = /^[A-Za-z0-9._-]+$/;

/**
 * The number as it goes into an id: whitespace dropped, so `RE 33` and `RE33`
 * are one line rather than two lines one typo apart. `null` when what is left
 * cannot go into an id, which the step reports as the feed's fault.
 */
export function compactNumber(number: string): string | null {
  const compact = number.replaceAll(/\s+/g, '');

  return NUMBER.test(compact) ? compact : null;
}

export type LineKey =
  | { region: string; category: Category; number: string }
  | { region: string; category: Category; number: null; terminals: [string, string] };

/**
 * `s-bahn-zuerich:S10` for a numbered line, and for one with no number the
 * category and its two terminals by Didok number,
 * `fernverkehr:IC:8503000-8506302`. Didok numbers survive a feed regeneration;
 * the `route_id` does not, and never appears.
 *
 * Most numbers already say their category — `S10`, `IR35`, `RE33` — and those
 * ids leave it out. Plenty do not: the 2026 feed has an ICE `3` and a Nightjet
 * `3` in the one national region, and every rack railway, most funiculars and
 * most TGVs carry a bare number or code. Those get the category in front,
 * `fernverkehr:ICE-3`, rather than two lines colliding on `fernverkehr:3`.
 */
export function lineId(key: LineKey): string {
  if (key.number !== null) {
    const number = key.number.toUpperCase().startsWith(key.category)
      ? key.number
      : `${key.category}-${key.number}`;

    return `${key.region}:${number}`;
  }

  const [first, last] = key.terminals;

  return `${key.region}:${key.category}:${first}-${last}`;
}

/**
 * Splits routes into groups that share at least one station, transitively. Two
 * directions of a line share every station; a short-turn shares most of them; a
 * branch shares the trunk. Routes that share nothing at all are two lines that
 * happen to carry one number in one region — which is what the step reports.
 *
 * Union-find over a station index, so it costs one pass over the stations rather
 * than one comparison per pair of routes. Each component is sorted, and the
 * components are sorted by their first route, so the answer has one spelling.
 */
export function components(
  stationsByRoute: ReadonlyMap<string, ReadonlySet<string>>,
): string[][] {
  const parent = new Map<string, string>();

  const find = (routeId: string): string => {
    let root = routeId;

    while (parent.get(root) !== root) {
      root = parent.get(root) ?? root;
    }

    parent.set(routeId, root);
    return root;
  };

  const firstRouteAt = new Map<string, string>();

  for (const [routeId, stations] of stationsByRoute) {
    parent.set(routeId, routeId);

    for (const station of stations) {
      const other = firstRouteAt.get(station);

      if (other === undefined) {
        firstRouteAt.set(station, routeId);
        continue;
      }

      const [a, b] = [find(routeId), find(other)];

      if (a !== b) {
        parent.set(a, b);
      }
    }
  }

  const groups = new Map<string, string[]>();

  for (const routeId of stationsByRoute.keys()) {
    const root = find(routeId);
    groups.set(root, [...(groups.get(root) ?? []), routeId]);
  }

  return [...groups.values()]
    .map(group => group.sort(compare))
    .sort((a, b) => compare(a[0] ?? '', b[0] ?? ''));
}
