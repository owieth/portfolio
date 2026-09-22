import { describe, expect, it } from 'vitest';

import { mrzLine } from '@/lib/stats/flights/passport-mrz';
import { SEED } from '@/lib/stats/flights/seed.fixture';
import { flightTotals, rankAirlines, toLegs } from '@/lib/stats/flights/stats';
import type { FlightTotals } from '@/lib/stats/flights/types';

const LEGS = toLegs([...SEED]);
const TOTALS = flightTotals(LEGS);
const AIRLINES = rankAirlines(LEGS).length;

const EMPTY: FlightTotals = {
  flights: 0,
  distanceKm: 0,
  durationMinutes: 0,
  airports: 0,
  countries: 0,
};

describe('mrzLine', () => {
  it('is exactly 44 characters, whatever it is given', () => {
    // The length is the thing that reads as a passport. A line that grows with
    // the totals would start wrapping or overflowing its row instead.
    expect(mrzLine(TOTALS, AIRLINES)).toHaveLength(44);
    expect(mrzLine(EMPTY, 0)).toHaveLength(44);
    expect(
      mrzLine({ ...TOTALS, distanceKm: 99_999_999, flights: 123_456 }, 1_000),
    ).toHaveLength(44);
  });

  it('uses only the MRZ alphabet', () => {
    // Catches a stray U+2019 from `formatDistanceKm`, a space from a template,
    // or a lowercase label — none of which exist on a real document.
    expect(mrzLine(TOTALS, AIRLINES)).toMatch(/^[A-Z0-9<]{44}$/);
    expect(mrzLine(EMPTY, 0)).toMatch(/^[A-Z0-9<]{44}$/);
  });

  it('carries the totals it was given', () => {
    const line = mrzLine(TOTALS, AIRLINES);

    expect(line).toContain(`FLT<${String(TOTALS.flights).padStart(4, '0')}`);
    expect(line).toContain(`APT<${String(TOTALS.airports).padStart(2, '0')}`);
    expect(line).toContain(`AIR<${String(AIRLINES).padStart(2, '0')}`);
  });

  it('leaves filler at the end for a realistic log', () => {
    // The fields are sized so a lifetime of flying still fits with room to
    // spare; this is what notices when one of them is widened past that.
    expect(mrzLine(TOTALS, AIRLINES).endsWith('<')).toBe(true);
  });

  it('rounds block time into whole hours', () => {
    expect(mrzLine({ ...EMPTY, durationMinutes: 90 }, 0)).toContain('HRS<0002');
    expect(mrzLine({ ...EMPTY, durationMinutes: 59 }, 0)).toContain('HRS<0001');
  });

  it('has no minus sign to offer a negative total', () => {
    // Not reachable from the query, but the alphabet has no `-` and a `-1`
    // would break the regex above rather than render.
    expect(mrzLine({ ...EMPTY, flights: -5 }, 0)).toContain('FLT<0000');
  });

  it('is deterministic', () => {
    expect(mrzLine(TOTALS, AIRLINES)).toBe(mrzLine(TOTALS, AIRLINES));
  });
});
