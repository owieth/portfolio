import { describe, expect, it } from 'vitest';

import { AIRPORTS } from '@/lib/stats/flights/airports';
import {
  greatCircleDistanceKm,
  greatCirclePath,
} from '@/lib/stats/flights/geo';
import type { MultiLineString } from '@/lib/stats/flights/types';

/**
 * Ground truth: the haversine formula at R = 6371.0088 km over the registry's
 * own coordinates, recomputed independently rather than copied from the
 * implementation. These are great-circle distances between airport reference
 * points, so a real flight is always longer — the page says "~" for a reason.
 *
 * A wrong digit in `airports.ts` fails here and nowhere else.
 */
const DISTANCES = [
  { name: 'ZRH -> LHR', from: AIRPORTS.ZRH, to: AIRPORTS.LHR, km: 787.6 },
  { name: 'ZRH -> JFK', from: AIRPORTS.ZRH, to: AIRPORTS.JFK, km: 6309.3 },
  { name: 'GVA -> LHR', from: AIRPORTS.GVA, to: AIRPORTS.LHR, km: 753.7 },
  { name: 'ZRH -> BOS', from: AIRPORTS.ZRH, to: AIRPORTS.BOS, km: 6010.2 },
] as const;

/** Half the circumference at the same radius, the antipodal upper bound. */
const HALF_CIRCUMFERENCE_KM = 20_015.086;

describe('greatCircleDistanceKm', () => {
  it('reproduces the known pairs to a tenth of a kilometre', () => {
    for (const { name, from, to, km } of DISTANCES) {
      expect(greatCircleDistanceKm(from, to), name).toBeCloseTo(km, 1);
    }
  });

  it('is symmetric in its arguments', () => {
    for (const { name, from, to } of DISTANCES) {
      expect(greatCircleDistanceKm(to, from), name).toBeCloseTo(
        greatCircleDistanceKm(from, to),
        9,
      );
    }
  });

  it('is zero between a point and itself', () => {
    expect(greatCircleDistanceKm(AIRPORTS.ZRH, AIRPORTS.ZRH)).toBe(0);
  });

  it('is half the circumference between antipodes', () => {
    // The formula's worst-numeric case: the haversine lands on 1, and an
    // unclamped sqrt drifting a few ulp past it turns asin into NaN.
    expect(
      greatCircleDistanceKm({ lat: 0, lon: 0 }, { lat: 0, lon: 180 }),
    ).toBeCloseTo(HALF_CIRCUMFERENCE_KM, 1);
    expect(
      greatCircleDistanceKm({ lat: 45, lon: 10 }, { lat: -45, lon: -170 }),
    ).toBeCloseTo(HALF_CIRCUMFERENCE_KM, 1);
  });

  it('never exceeds half the circumference', () => {
    // Takes the short way round, always. A formula that let a longitude
    // difference past 180 through would fail here on the transatlantic pairs.
    for (const { name, from, to } of DISTANCES) {
      expect(greatCircleDistanceKm(from, to), name).toBeLessThan(
        HALF_CIRCUMFERENCE_KM,
      );
    }
  });

  it('measures the short way across the antimeridian', () => {
    // Tokyo to Los Angeles is 8753.8 km eastward over the Pacific, not the
    // 31 276 km you get by reading the longitude difference the long way.
    const nrt = { lat: 35.7647, lon: 140.3863 };
    const lax = { lat: 33.9416, lon: -118.4085 };

    expect(greatCircleDistanceKm(nrt, lax)).toBeCloseTo(8753.8, 1);
  });
});

/**
 * Tokyo and Los Angeles, the only pair here that crosses the date line.
 * Neither is in the registry — none of the 26 seeded flights leaves Europe
 * and the Atlantic — which is why `greatCirclePath` takes a bare `GeoPoint`
 * rather than an `AirportCode`.
 */
const NRT = { lat: 35.7647, lon: 140.3863 };
const LAX = { lat: 33.9416, lon: -118.4085 };

const allCoordinates = (geometry: MultiLineString) =>
  geometry.coordinates.flat();

describe('greatCirclePath', () => {
  it('starts and ends on the airports it was given', () => {
    // Not bit-exact: every sample round-trips through lat/lon -> xyz -> lat/lon.
    // Nine decimal degrees is a tenth of a millimetre.
    const { coordinates } = greatCirclePath(AIRPORTS.ZRH, AIRPORTS.JFK);
    const first = coordinates[0][0];
    const last = coordinates.at(-1)!.at(-1)!;

    expect(first[0]).toBeCloseTo(AIRPORTS.ZRH.lon, 9);
    expect(first[1]).toBeCloseTo(AIRPORTS.ZRH.lat, 9);
    expect(last[0]).toBeCloseTo(AIRPORTS.JFK.lon, 9);
    expect(last[1]).toBeCloseTo(AIRPORTS.JFK.lat, 9);
  });

  it('samples points that lie on the arc, not on the chord', () => {
    // A linear interpolation between the endpoints would satisfy every other
    // test in this block. This is the one that says the path is spherical:
    // the two hops through any sample add up to the direct distance.
    const direct = greatCircleDistanceKm(AIRPORTS.ZRH, AIRPORTS.JFK);

    for (const [lon, lat] of allCoordinates(
      greatCirclePath(AIRPORTS.ZRH, AIRPORTS.JFK),
    )) {
      const viaPoint =
        greatCircleDistanceKm(AIRPORTS.ZRH, { lat, lon }) +
        greatCircleDistanceKm({ lat, lon }, AIRPORTS.JFK);

      expect(viaPoint, `${lon},${lat}`).toBeCloseTo(direct, 6);
    }
  });

  it('keeps every coordinate on the globe', () => {
    for (const [lon, lat] of allCoordinates(greatCirclePath(NRT, LAX))) {
      expect(lon).toBeGreaterThanOrEqual(-180);
      expect(lon).toBeLessThanOrEqual(180);
      expect(lat).toBeGreaterThanOrEqual(-90);
      expect(lat).toBeLessThanOrEqual(90);
    }
  });

  it('draws a pair that stays put as a single line', () => {
    const { coordinates } = greatCirclePath(AIRPORTS.ZRH, AIRPORTS.JFK);

    expect(coordinates).toHaveLength(1);
  });

  it('splits a date-line crossing into two lines that meet at the seam', () => {
    // The failure this guards against is silent: MapLibre's projectX does no
    // normalisation, so a continuous path running past 180 survives the z0
    // tile and then disappears as geojson-vt clips the children.
    const { coordinates } = greatCirclePath(NRT, LAX);

    expect(coordinates).toHaveLength(2);

    const leaving = coordinates[0].at(-1)!;
    const arriving = coordinates[1][0];

    expect(leaving[0]).toBe(180);
    expect(arriving[0]).toBe(-180);
    // One computed latitude, used for both edges, so the seam cannot gap.
    expect(arriving[1]).toBe(leaving[1]);
    expect(leaving[1]).toBeCloseTo(47.2868, 4);
  });

  it('never lets a single segment span the antimeridian', () => {
    // The invariant the split exists to produce, checked on the geometry
    // rather than on the endpoints of the split.
    for (const line of greatCirclePath(NRT, LAX).coordinates) {
      for (let i = 1; i < line.length; i += 1) {
        expect(Math.abs(line[i][0] - line[i - 1][0])).toBeLessThanOrEqual(180);
      }
    }
  });

  it('honours the segment count', () => {
    expect(
      greatCirclePath(AIRPORTS.ZRH, AIRPORTS.JFK, 8).coordinates[0],
    ).toHaveLength(9);
  });

  it('returns drawable geometry for coincident points', () => {
    // sin(d) is zero here, and an unguarded slerp divides by it.
    const { coordinates } = greatCirclePath(AIRPORTS.ZRH, AIRPORTS.ZRH);

    expect(coordinates).toHaveLength(1);
    expect(coordinates[0].length).toBeGreaterThanOrEqual(2);
    for (const [lon, lat] of allCoordinates({
      type: 'MultiLineString',
      coordinates,
    })) {
      expect(lon).toBeCloseTo(AIRPORTS.ZRH.lon, 9);
      expect(lat).toBeCloseTo(AIRPORTS.ZRH.lat, 9);
    }
  });

  it('returns drawable geometry for antipodal points', () => {
    // sin(d) is zero again, for the opposite reason: every great circle
    // through the pair is equally correct, so the module picks one.
    const from = { lat: 45, lon: 10 };
    const to = { lat: -45, lon: -170 };
    const { coordinates } = greatCirclePath(from, to);
    const points = allCoordinates({ type: 'MultiLineString', coordinates });

    expect(points.length).toBeGreaterThan(2);
    for (const [lon, lat] of points) {
      expect(Number.isFinite(lon)).toBe(true);
      expect(Number.isFinite(lat)).toBe(true);
    }

    const last = coordinates.at(-1)!.at(-1)!;
    expect(last[0]).toBeCloseTo(to.lon, 6);
    expect(last[1]).toBeCloseTo(to.lat, 6);
  });
});
