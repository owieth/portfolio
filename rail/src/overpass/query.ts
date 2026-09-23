/**
 * The Overpass queries the geometry comes from, and the key each one is cached
 * under.
 *
 * One query per route type rather than one for both. The public instance hands
 * out about two slots per client, the train query is the heavy one, and a
 * failure there should not cost the funicular answer that already arrived. Each
 * also gets a cache entry of its own, so deleting one refetches only that one.
 *
 * `out body geom` inlines every member way's coordinates and every stop node's
 * position into the relation, so the match step has everything it needs from
 * this one answer and never has to go back for a second.
 */

import { createHash } from 'node:crypto';

export const ROUTE_TYPES = ['train', 'funicular'] as const;

export type RouteType = (typeof ROUTE_TYPES)[number];

/**
 * Server-side, in seconds. The train query runs for minutes on a quiet
 * instance, and the 180 second default is the most common way it fails.
 */
export const QUERY_TIMEOUT_S = 900;

/**
 * Switzerland by its ISO code at national level, not a bounding box: the box
 * takes in half of Vorarlberg, Baden and Lombardy. A relation is in the area when
 * any of its members is, so an EC to Milano comes back whole, border crossing and
 * all; what to keep of it is the match step's decision.
 */
export function buildQuery(route: RouteType): string {
  return [
    `[out:json][timeout:${QUERY_TIMEOUT_S}];`,
    'area["ISO3166-1"="CH"][admin_level=2]->.ch;',
    `relation["type"="route"]["route"="${route}"](area.ch);`,
    'out body geom;',
  ].join('\n');
}

/**
 * The first 16 hex characters of the query's sha256, the same shape as a stop
 * pattern's id. A function of the query text and nothing else, so an edit to a
 * query is a new entry rather than a stale answer read back under the old name.
 */
export function queryKey(query: string): string {
  return createHash('sha256').update(query).digest('hex').slice(0, 16);
}
