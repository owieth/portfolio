/**
 * Distances in metres, for deciding whether a station lies on a relation's
 * track.
 *
 * Every question the match step asks is "is this within a few hundred metres",
 * so the answers only have to be right at that scale. A point's distance to a
 * polyline is taken on a plane tangent at the point: exact enough within a
 * kilometre, and a segment far away comes out far away, which is all a
 * threshold needs to know about it.
 */

import type { LatLon } from '../../../src/lib/geo/ch.ts';

/** The IUGG mean radius. */
const EARTH_RADIUS_M = 6_371_008.8;

const RADIANS = Math.PI / 180;

/** Great-circle distance. */
export function metres(a: LatLon, b: LatLon): number {
  const dLat = (b.lat - a.lat) * RADIANS;
  const dLon = (b.lon - a.lon) * RADIANS;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * RADIANS) * Math.cos(b.lat * RADIANS) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The shortest distance from `point` to any segment of `line`. `Infinity` for an empty line. */
export function metresToLine(point: LatLon, line: readonly LatLon[]): number {
  const scaleY = EARTH_RADIUS_M * RADIANS;
  const scaleX = scaleY * Math.cos(point.lat * RADIANS);
  const project = ({ lat, lon }: LatLon): [number, number] => [
    (lon - point.lon) * scaleX,
    (lat - point.lat) * scaleY,
  ];

  if (line.length === 1) {
    return metres(point, line[0] as LatLon);
  }

  let best = Infinity;

  for (let index = 1; index < line.length; index += 1) {
    const [ax, ay] = project(line[index - 1] as LatLon);
    const [bx, by] = project(line[index] as LatLon);
    const dx = bx - ax;
    const dy = by - ay;
    const length = dx * dx + dy * dy;
    const t = length === 0 ? 0 : Math.min(1, Math.max(0, -(ax * dx + ay * dy) / length));

    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }

  return best;
}

/** The shortest distance from `point` to any of `lines`. */
export function metresToLines(point: LatLon, lines: readonly (readonly LatLon[])[]): number {
  return lines.reduce((best, line) => Math.min(best, metresToLine(point, line)), Infinity);
}
