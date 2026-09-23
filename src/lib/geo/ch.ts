/**
 * Where Switzerland is, for anything in this repo that has to ask.
 *
 * Two consumers with nothing else in common: the wo-haere game clamps a throw
 * and a map view to this box, and the rail pipeline cross-checks it against a
 * station's UIC country code. One box, because two copies of four numbers drift
 * and nobody notices until a station on the border changes sides.
 *
 * Deliberately free of imports. `rail/` reaches this file through a relative
 * `.ts` specifier under Node's type stripping, where the `@/` alias does not
 * exist and a transitive import of anything app-shaped would not resolve.
 */

export interface LatLon {
  lat: number;
  lon: number;
}

/** Bounding box of Swiss territory. Generous: it contains Liechtenstein too. */
export const CH_BOUNDS = {
  west: 5.9559,
  south: 45.818,
  east: 10.4921,
  north: 47.8085,
} as const;

export function isInChBbox({ lat, lon }: LatLon): boolean {
  return (
    lon >= CH_BOUNDS.west &&
    lon <= CH_BOUNDS.east &&
    lat >= CH_BOUNDS.south &&
    lat <= CH_BOUNDS.north
  );
}
