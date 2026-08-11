/**
 * swisstopo approximate formulas between WGS84 and the Swiss LV95 projection.
 * Accurate to well under a metre inside Switzerland, which is far beyond what
 * a thrown dart deserves — and it avoids a network round-trip to the
 * geodesy.geo.admin.ch reframe service on every throw.
 *
 * Reference values checked against the reframe API during development:
 *   8.041 E, 46.624 N  ->  2646134.22, 1163815.46  (reframe: 2646134.28, 1163815.47)
 */

export interface Lv95 {
  easting: number;
  northing: number;
}

export function wgs84ToLv95(lon: number, lat: number): Lv95 {
  const lambda = (lon * 3600 - 26782.5) / 10000;
  const phi = (lat * 3600 - 169028.66) / 10000;

  const lambda2 = lambda * lambda;
  const lambda3 = lambda2 * lambda;
  const phi2 = phi * phi;
  const phi3 = phi2 * phi;

  const easting =
    600072.37 +
    211455.93 * lambda -
    10938.51 * lambda * phi -
    0.36 * lambda * phi2 -
    44.54 * lambda3;

  const northing =
    200147.07 +
    308807.95 * phi +
    3745.25 * lambda2 +
    76.63 * phi2 -
    194.56 * lambda2 * phi +
    119.79 * phi3;

  return { easting: easting + 2_000_000, northing: northing + 1_000_000 };
}
