import { describe, expect, it } from 'vitest';

import { AIRPORTS } from '@/lib/stats/flights/airports';
import { COUNTRIES, country } from '@/lib/stats/flights/countries';

const ENTRIES = Object.entries(COUNTRIES);

describe('COUNTRIES', () => {
  it('keys every entry by its own code', () => {
    for (const [code, entry] of ENTRIES) {
      expect(entry.code, code).toBe(code);
    }
  });

  it('holds the eleven countries the airports sit in, and no more', () => {
    // Both directions. A country with no airport is dead weight, and an
    // airport whose code is missing here is a flag that will not render — the
    // failure #453 would otherwise ship.
    const flown = new Set(
      Object.values(AIRPORTS).map(({ countryCode }) => countryCode),
    );

    expect(new Set(Object.keys(COUNTRIES))).toEqual(flown);
    expect(ENTRIES).toHaveLength(11);
  });

  it('uses GB for the United Kingdom', () => {
    // The alpha-2 code is `GB`. `UK` is an exceptional reservation and not a
    // code, and it is the mistake this registry invites.
    expect(COUNTRIES.GB.name).toBe('United Kingdom');
    expect(country('UK')).toBeNull();
  });

  it('answers null for a code outside the registry', () => {
    expect(country('XX')).toBeNull();
  });

  it('does not resolve inherited object properties', () => {
    expect(country('toString')).toBeNull();
    expect(country('constructor')).toBeNull();
  });
});
