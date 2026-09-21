import { describe, expect, it } from 'vitest';

import { AIRPORTS, airport } from '@/lib/stats/flights/airports';

const ENTRIES = Object.entries(AIRPORTS);

describe('AIRPORTS', () => {
  it('keys every entry by its own IATA code', () => {
    // `satisfies Record<string, Airport>` checks the shape of each value but
    // never that the key and the `iata` field agree, so a copy-paste that
    // renames one and not the other would pass the compiler and silently
    // mislabel a route.
    for (const [code, entry] of ENTRIES) {
      expect(entry.iata, code).toBe(code);
    }
  });

  it('holds the thirteen airports the seed flies between', () => {
    expect(ENTRIES).toHaveLength(13);
  });

  it('spans eleven countries, not thirteen', () => {
    // The gap is the whole reason `flightTotals` counts distinct countries
    // rather than airports: ZRH and GVA are both Switzerland, BOS and JFK are
    // both the United States.
    const countries = new Set(ENTRIES.map(([, entry]) => entry.country));

    expect(countries.size).toBe(11);
  });

  it('puts EuroAirport in France', () => {
    // Deliberate, and the one entry someone will eventually "fix". Basel's
    // airport sits on French soil under joint Franco-Swiss operation.
    expect(AIRPORTS.BSL.country).toBe('France');
  });

  it('keeps every coordinate on the globe', () => {
    for (const [code, { lat, lon }] of ENTRIES) {
      expect(lat, code).toBeGreaterThanOrEqual(-90);
      expect(lat, code).toBeLessThanOrEqual(90);
      expect(lon, code).toBeGreaterThanOrEqual(-180);
      expect(lon, code).toBeLessThanOrEqual(180);
    }
  });
});

describe('airport', () => {
  it('resolves a known code', () => {
    expect(airport('ZRH')).toBe(AIRPORTS.ZRH);
  });

  it('answers null for a code outside the registry', () => {
    expect(airport('XXX')).toBeNull();
  });

  it('does not resolve inherited object properties', () => {
    // `code in AIRPORTS` walks the prototype chain, so without care these
    // would come back as airports and crash whatever read `.lat` off them.
    expect(airport('toString')).toBeNull();
    expect(airport('constructor')).toBeNull();
  });
});
