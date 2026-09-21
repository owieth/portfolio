import { describe, expect, it, vi } from 'vitest';

import { AIRPORTS } from '@/lib/stats/flights/airports';
import { COUNTRIES } from '@/lib/stats/flights/countries';
import { SEED } from '@/lib/stats/flights/seed.fixture';
import {
  airportVisits,
  countryVisits,
  flightTotals,
  rankRoutes,
  toLegs,
} from '@/lib/stats/flights/stats';
import type { Flight, FlightLeg } from '@/lib/stats/flights/types';

const SEED_FLIGHTS: Flight[] = [...SEED];
const SEED_LEGS = toLegs(SEED_FLIGHTS);

/** Distances summed from the registry's coordinates at R = 6371.0088 km. */
const EXPECTED_ROUTES = [
  { key: 'LHR-ZRH', flights: 6, distanceKm: 4725.5 },
  { key: 'OSL-ZRH', flights: 4, distanceKm: 5700.1 },
  { key: 'LIS-ZRH', flights: 2, distanceKm: 3447.7 },
  { key: 'RHO-VIE', flights: 2, distanceKm: 3212.5 },
  { key: 'BCN-ZRH', flights: 2, distanceKm: 1713.1 },
  { key: 'GVA-LHR', flights: 2, distanceKm: 1507.4 },
  { key: 'BER-ZRH', flights: 2, distanceKm: 1300.0 },
  { key: 'VIE-ZRH', flights: 2, distanceKm: 1206.4 },
  { key: 'AMS-BSL', flights: 2, distanceKm: 1121.6 },
  { key: 'JFK-ZRH', flights: 1, distanceKm: 6309.3 },
  { key: 'BOS-ZRH', flights: 1, distanceKm: 6010.2 },
] as const;

const leg = (
  from: keyof typeof AIRPORTS,
  to: keyof typeof AIRPORTS,
  distanceKm: number,
): FlightLeg => ({
  flight: SEED_FLIGHTS[0],
  from: AIRPORTS[from],
  to: AIRPORTS[to],
  distanceKm,
});

describe('toLegs', () => {
  it('resolves both endpoints and derives the distance', () => {
    const [first] = SEED_LEGS;

    expect(first.from).toBe(AIRPORTS.ZRH);
    expect(first.to).toBe(AIRPORTS.BCN);
    expect(first.distanceKm).toBeCloseTo(856.5, 1);
  });

  it('keeps every seeded flight', () => {
    expect(SEED_LEGS).toHaveLength(26);
  });

  it('preserves input order', () => {
    // Ordering belongs to the query. If this ever sorts, the flight log and
    // the globe stop agreeing on which flight is which.
    expect(SEED_LEGS.map(({ flight }) => flight.id)).toEqual(
      SEED_FLIGHTS.map(({ id }) => id),
    );
  });

  it('skips a flight with an unknown code and says which one', () => {
    // The check constraint in Postgres catches the shape of an IATA code and
    // not the value, and there is no airports table to foreign-key against.
    // Silently counting a zero-distance leg would put the error in the totals.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const typo: Flight = { ...SEED_FLIGHTS[0], id: 'typo', destination: 'XXX' };

    const legs = toLegs([...SEED_FLIGHTS, typo]);

    expect(legs).toHaveLength(26);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('XXX');
    warn.mockRestore();
  });
});

describe('flightTotals', () => {
  it('sums the seed', () => {
    const totals = flightTotals(SEED_LEGS);

    expect(totals.flights).toBe(26);
    expect(totals.distanceKm).toBeCloseTo(36_253.8, 1);
    expect(totals.durationMinutes).toBe(3700);
  });

  it('counts distinct airports and countries, not visits', () => {
    // 52 endpoints across 26 legs, 13 airports, 11 countries. The gap between
    // 13 and 11 is the assertion that matters: ZRH and GVA are both
    // Switzerland, BOS and JFK are both the United States.
    const totals = flightTotals(SEED_LEGS);

    expect(totals.airports).toBe(13);
    expect(totals.countries).toBe(11);
  });

  it('is zero across the board for no flights', () => {
    expect(flightTotals([])).toEqual({
      flights: 0,
      distanceKm: 0,
      durationMinutes: 0,
      airports: 0,
      countries: 0,
    });
  });
});

describe('rankRoutes', () => {
  const ranked = rankRoutes(SEED_LEGS);

  it('ranks the seed', () => {
    expect(ranked.map(({ key }) => key)).toEqual(
      EXPECTED_ROUTES.map(({ key }) => key),
    );

    for (const [i, expected] of EXPECTED_ROUTES.entries()) {
      expect(ranked[i].flights, expected.key).toBe(expected.flights);
      expect(ranked[i].distanceKm, expected.key).toBeCloseTo(
        expected.distanceKm,
        1,
      );
    }
  });

  it('collapses both directions into one route', () => {
    // Three out and three back, not two rows of three.
    const zurichLondon = ranked.filter(({ key }) => key === 'LHR-ZRH');

    expect(zurichLondon).toHaveLength(1);
    expect(zurichLondon[0].flights).toBe(6);
  });

  it('keeps an open jaw as two routes', () => {
    // Out to Boston, back from New York. Collapsing these would invent a
    // return trip that never happened.
    const bos = ranked.find(({ key }) => key === 'BOS-ZRH');
    const jfk = ranked.find(({ key }) => key === 'JFK-ZRH');

    expect(bos?.flights).toBe(1);
    expect(jfk?.flights).toBe(1);
  });

  it('keeps a connection as two routes', () => {
    // ZRH -> VIE -> RHO is two routes. There is no ZRH -> RHO flight.
    expect(ranked.find(({ key }) => key === 'RHO-ZRH')).toBeUndefined();
    expect(ranked.find(({ key }) => key === 'VIE-ZRH')?.flights).toBe(2);
    expect(ranked.find(({ key }) => key === 'RHO-VIE')?.flights).toBe(2);
  });

  it('breaks a distance tie on the key rather than on insertion order', () => {
    // Same flights, same distance. Without the third sort term the answer
    // would depend on which row Postgres handed over first.
    const forwards = rankRoutes([
      leg('ZRH', 'BER', 500),
      leg('AMS', 'BSL', 500),
    ]);
    const backwards = rankRoutes([
      leg('AMS', 'BSL', 500),
      leg('ZRH', 'BER', 500),
    ]);

    expect(forwards.map(({ key }) => key)).toEqual(['AMS-BSL', 'BER-ZRH']);
    expect(backwards.map(({ key }) => key)).toEqual(['AMS-BSL', 'BER-ZRH']);
  });

  it('orders equal flight counts by total distance', () => {
    const twos = ranked.filter(({ flights }) => flights === 2);

    expect(twos.map(({ key }) => key)).toEqual([
      'LIS-ZRH',
      'RHO-VIE',
      'BCN-ZRH',
      'GVA-LHR',
      'BER-ZRH',
      'VIE-ZRH',
      'AMS-BSL',
    ]);
  });
});

describe('airportVisits', () => {
  it('counts every appearance as an endpoint', () => {
    // 52 endpoints across 26 legs. Zurich is on 20 of them.
    const visits = airportVisits(SEED_LEGS);
    const total = visits.reduce((sum, { visits: n }) => sum + n, 0);

    expect(total).toBe(52);
    expect(visits[0]).toMatchObject({ visits: 20 });
    expect(visits[0].airport).toBe(AIRPORTS.ZRH);
  });

  it('orders by visits, then by code', () => {
    expect(
      airportVisits(SEED_LEGS).map(({ airport, visits }) => [
        airport.iata,
        visits,
      ]),
    ).toEqual([
      ['ZRH', 20],
      ['LHR', 8],
      ['OSL', 4],
      ['VIE', 4],
      ['AMS', 2],
      ['BCN', 2],
      ['BER', 2],
      ['BSL', 2],
      ['GVA', 2],
      ['LIS', 2],
      ['RHO', 2],
      ['BOS', 1],
      ['JFK', 1],
    ]);
  });
});

describe('countryVisits', () => {
  it('counts the same endpoints airportVisits does', () => {
    // The two have to agree: 52 endpoints across 26 legs, and Switzerland on
    // 22 of them (Zurich 20, Geneva 2).
    const visits = countryVisits(SEED_LEGS);
    const total = visits.reduce((sum, { visits: n }) => sum + n, 0);

    expect(total).toBe(52);
    expect(visits[0]).toMatchObject({ visits: 22 });
    expect(visits[0].country).toBe(COUNTRIES.CH);
  });

  it('orders by visits, then by code', () => {
    // This is the order the flag row renders in, so it is the order under test.
    expect(
      countryVisits(SEED_LEGS).map(({ country, visits }) => [
        country.code,
        visits,
      ]),
    ).toEqual([
      ['CH', 22],
      ['GB', 8],
      ['AT', 4],
      ['NO', 4],
      ['DE', 2],
      ['ES', 2],
      ['FR', 2],
      ['GR', 2],
      ['NL', 2],
      ['PT', 2],
      ['US', 2],
    ]);
  });

  it('counts a domestic leg twice', () => {
    // Endpoint appearances, not legs touching the country — the same rule
    // `airportVisits` uses for a turnaround.
    expect(countryVisits([leg('ZRH', 'GVA', 224.3)])).toEqual([
      { country: COUNTRIES.CH, visits: 2 },
    ]);
  });

  it('follows the registry rather than the city', () => {
    // EuroAirport is in Basel and in France, and the count follows the code.
    expect(
      countryVisits([leg('AMS', 'BSL', 560.8)]).map(({ country }) => country),
    ).toEqual([COUNTRIES.FR, COUNTRIES.NL]);
  });

  it('answers with nothing for no legs', () => {
    expect(countryVisits([])).toEqual([]);
  });
});
