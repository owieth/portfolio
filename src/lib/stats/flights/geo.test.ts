import { describe, expect, it } from 'vitest';

import { AIRPORTS } from '@/lib/stats/flights/airports';
import { greatCircleDistanceKm } from '@/lib/stats/flights/geo';

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
