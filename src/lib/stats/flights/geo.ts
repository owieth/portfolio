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

const toRad = (deg: number) => (deg * Math.PI) / 180;

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
