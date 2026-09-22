import { describe, expect, it } from 'vitest';

import {
  AIRPORT_VISIT_TIERS,
  ROUTE_FLIGHT_TIERS,
  stepExpression,
  tierValue,
} from '@/lib/stats/flights/tiers';

describe('stepExpression', () => {
  it('produces exactly the expressions the globe used to carry inline', () => {
    // Pinned literally rather than derived, because the point of this test is
    // that lifting the numbers out of FlightGlobe changed nothing about what
    // it draws. Derive both sides and it would pass whatever they became.
    expect(stepExpression('flights', ROUTE_FLIGHT_TIERS)).toEqual([
      'step',
      ['get', 'flights'],
      1,
      2,
      2.25,
      10,
      4,
    ]);

    expect(stepExpression('visits', AIRPORT_VISIT_TIERS)).toEqual([
      'step',
      ['get', 'visits'],
      2.5,
      2,
      4,
      10,
      6.5,
    ]);
  });
});

describe('tierValue', () => {
  it('reads the same steps MapLibre would', () => {
    // The whole reason the tiers are shared: the card resolves them in
    // JavaScript, the globe resolves them in a style expression, and the two
    // have to land on the same number for the same route.
    expect(tierValue(ROUTE_FLIGHT_TIERS, 1)).toBe(1);
    expect(tierValue(ROUTE_FLIGHT_TIERS, 2)).toBe(2.25);
    expect(tierValue(ROUTE_FLIGHT_TIERS, 9)).toBe(2.25);
    expect(tierValue(ROUTE_FLIGHT_TIERS, 10)).toBe(4);
    expect(tierValue(ROUTE_FLIGHT_TIERS, 400)).toBe(4);
  });

  it('falls back to the first tier below the first stop', () => {
    // Not reachable from the data — a ranked route has flown at least once —
    // but `step` answers its base value there and so should this.
    expect(tierValue(AIRPORT_VISIT_TIERS, 0)).toBe(2.5);
  });

  it('reads its tiers in ascending order', () => {
    for (const tiers of [ROUTE_FLIGHT_TIERS, AIRPORT_VISIT_TIERS]) {
      const stops = tiers.map(({ from }) => from);

      expect([...stops].sort((x, y) => x - y)).toEqual(stops);
    }
  });
});
