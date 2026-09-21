/**
 * Great-circle geometry for the flight paths: how far apart two airports are,
 * and the arc to draw between them.
 *
 * `@/lib/wo-haere/geo/ch` carries a near-identical `distanceKm`. It is not
 * reused: that module is scoped to the wo häre? case study, down to its
 * Berndeutsch vocabulary and the Swiss bounding box beside it. Promoting the
 * shared geometry into `src/lib/geo.ts` is its own change, alongside the same
 * treatment for `prefersReducedMotion`.
 */

import type { MultiLineString, Position } from '@/lib/stats/flights/types';

/**
 * Structural on purpose, so an `Airport` passes straight in and a test can
 * reach for an airport the registry has never heard of.
 */
export interface GeoPoint {
  lat: number;
  lon: number;
}

/** IUGG mean Earth radius. The 0.0088 is worth about a metre transatlantic. */
const EARTH_RADIUS_KM = 6371.0088;

const DEFAULT_SEGMENTS = 64;

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** Angular separation in radians — the part both exports are built on. */
const centralAngle = (a: GeoPoint, b: GeoPoint): number => {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;

  // Clamped because `h` can land a few ulp above 1 for antipodal points, and
  // `asin` of that is NaN rather than the half-turn it should be.
  return 2 * Math.asin(Math.min(1, Math.sqrt(h)));
};

export function greatCircleDistanceKm(a: GeoPoint, b: GeoPoint): number {
  return EARTH_RADIUS_KM * centralAngle(a, b);
}

type Vector = [x: number, y: number, z: number];

const toVector = ({ lat, lon }: GeoPoint): Vector => {
  const phi = toRad(lat);
  const lambda = toRad(lon);

  return [
    Math.cos(phi) * Math.cos(lambda),
    Math.cos(phi) * Math.sin(lambda),
    Math.sin(phi),
  ];
};

/** `atan2` answers in (-180, 180], so a sample can never be out of range. */
const toPosition = ([x, y, z]: Vector): Position => [
  toDeg(Math.atan2(y, x)),
  toDeg(Math.atan2(z, Math.hypot(x, y))),
];

/**
 * Some unit vector at right angles to `v`, used to pick a plane when the two
 * endpoints are antipodal and every great circle through them is equally
 * valid. Leaning on the north pole makes the arc go over the top, which at
 * least looks deliberate; the choice is arbitrary either way.
 */
const orthogonal = ([x, y, z]: Vector): Vector => {
  const dot = z;
  const [ox, oy, oz]: Vector = [-dot * x, -dot * y, 1 - dot * z];
  const length = Math.hypot(ox, oy, oz);

  // `v` is itself a pole, so the north pole gives nothing to work with.
  if (length < 1e-9) return [1, 0, 0];

  return [ox / length, oy / length, oz / length];
};

/**
 * Spherical linear interpolation, `segments + 1` points from `a` to `b`
 * inclusive. Both endpoints come back untouched, so the arc always starts and
 * ends on the airport rather than near it.
 */
const samplePoints = (
  a: GeoPoint,
  b: GeoPoint,
  segments: number,
): Position[] => {
  const d = centralAngle(a, b);
  const va = toVector(a);

  // Coincident. `sin(d)` is zero, and there is no arc to walk anyway.
  if (d === 0) return [toPosition(va), toPosition(va)];

  const sinD = Math.sin(d);
  // Antipodal: `sin(d)` is zero again, but this time because the arc is a
  // half-turn and the plane is undefined rather than absent. Pick one.
  const vb = sinD === 0 ? orthogonal(va) : toVector(b);

  return Array.from({ length: segments + 1 }, (_, i) => {
    const f = i / segments;
    const [A, B] =
      sinD === 0
        ? [Math.cos(f * d), Math.sin(f * d)]
        : [Math.sin((1 - f) * d) / sinD, Math.sin(f * d) / sinD];

    return toPosition([
      A * va[0] + B * vb[0],
      A * va[1] + B * vb[1],
      A * va[2] + B * vb[2],
    ]);
  });
};

/**
 * The arc to draw between two airports, sampled rather than left to the
 * renderer. MapLibre interpolates a two-point `LineString` linearly in
 * projected space, which is a rhumb line: on a globe that draws a visibly
 * wrong path for anything transatlantic.
 *
 * A `MultiLineString`, split at the antimeridian, because letting longitudes
 * run past ±180 and stay continuous does not work. MapLibre's
 * `projectX(x) { return x / 360 + .5 }` does no normalisation, so a coordinate
 * at lon 190 lands outside the world square: it survives in the z0 tile and
 * then vanishes as geojson-vt clips every child tile to its bounds. RFC 7946
 * §3.1.9 asks for the same split for its own reasons.
 *
 * None of the seeded flights cross the date line, which is exactly why this
 * has a unit test rather than a look at the screen.
 */
export function greatCirclePath(
  a: GeoPoint,
  b: GeoPoint,
  segments: number = DEFAULT_SEGMENTS,
): MultiLineString {
  const points = samplePoints(a, b, segments);
  const coordinates: Position[][] = [];
  let current: Position[] = [points[0]];

  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1];
    const point = points[i];

    if (Math.abs(point[0] - previous[0]) > 180) {
      // The chord wrapped. Close it on the edge it left through and reopen on
      // the other, so no single segment ever spans the seam.
      const side = previous[0] > 0 ? 180 : -180;
      const t = (side - previous[0]) / (side - previous[0] + (point[0] + side));
      // Linear along the chord, not the true latitude of the arc at ±180. The
      // geometry is already a chord sequence, so the split has to sit on the
      // chord it splits or the render gains a kink at the seam. It also makes
      // the two edges meet at one latitude by construction.
      const latCross = previous[1] + t * (point[1] - previous[1]);

      current.push([side, latCross]);
      coordinates.push(current);
      current = [[-side, latCross]];
    }

    current.push(point);
  }

  coordinates.push(current);

  // A crossing on the very first or last chord would otherwise leave a
  // one-point line behind, which is not a valid LineString.
  return {
    type: 'MultiLineString',
    coordinates: coordinates.filter(line => line.length >= 2),
  };
}
