import { describe, expect, it } from 'vitest';

import { AIRCRAFT, aircraft } from '@/lib/stats/flights/aircraft';
import { SEED } from '@/lib/stats/flights/seed.fixture';

const ENTRIES = Object.entries(AIRCRAFT);

describe('AIRCRAFT', () => {
  it('resolves every type in the seed', () => {
    // `flights.aircraft` is nullable, so a null row is a flight whose type was
    // never recorded and not a gap in the registry.
    for (const { aircraft: key } of SEED) {
      if (key === null) continue;

      expect(aircraft(key), key).not.toBeNull();
    }
  });

  it('holds the seven types the seed flies, and no more', () => {
    const flown = new Set(
      SEED.map(({ aircraft: key }) => key).filter(key => key !== null),
    );

    expect(new Set(Object.keys(AIRCRAFT))).toEqual(flown);
    expect(ENTRIES).toHaveLength(7);
  });

  it('carries a well-formed ICAO designator for each', () => {
    for (const [key, { icao }] of ENTRIES) {
      expect(icao, key).toMatch(/^[A-Z0-9]{4}$/);
    }
  });

  it('keeps the designators distinct', () => {
    // The whole point of the column: it is what a Flighty import would join
    // on, and a duplicate would silently merge two types into one.
    const designators = ENTRIES.map(([, { icao }]) => icao);

    expect(new Set(designators).size).toBe(designators.length);
  });

  it('keeps the marketing names and the designators apart', () => {
    // The reason this is a registry rather than a string tidy-up in a
    // component. `A220-300` is a marketing name; ICAO calls it `BCS3`, after
    // the Bombardier CSeries it used to be.
    expect(AIRCRAFT['A220-300'].icao).toBe('BCS3');
    expect(AIRCRAFT['A220-100'].icao).toBe('BCS1');
    expect(AIRCRAFT.A320neo.icao).toBe('A20N');
  });

  it('answers null for a type outside the registry', () => {
    expect(aircraft('A380')).toBeNull();
  });

  it('does not resolve inherited object properties', () => {
    expect(aircraft('toString')).toBeNull();
    expect(aircraft('constructor')).toBeNull();
  });
});
