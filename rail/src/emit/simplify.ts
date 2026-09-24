/**
 * Douglas–Peucker, for the copy of the geometry the map downloads.
 *
 * The tolerance is in metres rather than degrees, because a degree of longitude
 * is a third shorter than a degree of latitude at Swiss latitudes, and a
 * tolerance in degrees would flatten east–west valleys more than north–south
 * ones. Each part is projected onto a plane scaled at its first point, which is
 * exact enough over the length of any Swiss line.
 *
 * The first and last point of a part are always kept, so a line still starts
 * and ends at its termini, and parts still meet where they met before.
 */

import type { Position } from 'geojson';

/**
 * About a pixel at zoom 12 over Switzerland, so a line still follows its valley
 * at city zoom, and the whole network comes out near a megabyte.
 */
export const WEB_TOLERANCE_M = 30;

/** The IUGG mean radius. */
const EARTH_RADIUS_M = 6_371_008.8;

const RADIANS = Math.PI / 180;

const METRES_PER_DEGREE = EARTH_RADIUS_M * RADIANS;

/** The squared distance from `p` to the segment `a`–`b`, or to `a` when the segment has no length. */
function squaredToSegment(
  [px, py]: readonly [number, number],
  [ax, ay]: readonly [number, number],
  [bx, by]: readonly [number, number],
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / length));
  const ex = ax + t * dx - px;
  const ey = ay + t * dy - py;

  return ex * ex + ey * ey;
}

/**
 * The points of `part` that Douglas–Peucker keeps at `toleranceM`, in order.
 * Iterative rather than recursive, so a part of tens of thousands of points
 * cannot run out of stack.
 */
export function simplifyPart<Point extends Position>(
  part: readonly Point[],
  toleranceM: number,
): Point[] {
  if (part.length <= 2) {
    return [...part];
  }

  const scaleX = METRES_PER_DEGREE * Math.cos((part[0]?.[1] ?? 0) * RADIANS);
  const projected = part.map(([lon = 0, lat = 0]): [number, number] => [
    lon * scaleX,
    lat * METRES_PER_DEGREE,
  ]);
  const kept = new Uint8Array(part.length);
  const pending: [number, number][] = [[0, part.length - 1]];
  const tolerance = toleranceM * toleranceM;

  kept[0] = 1;
  kept[part.length - 1] = 1;

  for (let span = pending.pop(); span !== undefined; span = pending.pop()) {
    const [first, last] = span;
    let farthest = -1;
    let distance = -1;

    for (let index = first + 1; index < last; index += 1) {
      const squared = squaredToSegment(
        projected[index] as [number, number],
        projected[first] as [number, number],
        projected[last] as [number, number],
      );

      if (squared > distance) {
        distance = squared;
        farthest = index;
      }
    }

    if (distance > tolerance) {
      kept[farthest] = 1;
      pending.push([first, farthest], [farthest, last]);
    }
  }

  return part.filter((_, index) => kept[index] === 1);
}

export function simplifyParts<Point extends Position>(
  parts: readonly (readonly Point[])[],
  toleranceM: number,
): Point[][] {
  return parts.map(part => simplifyPart(part, toleranceM));
}
