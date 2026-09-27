import { describe, expect, it } from 'vitest';

import { formatZurichDate, formatZurichTime } from '@/lib/clock';

describe('formatZurichTime', () => {
  it('follows Zurich across midnight and both DST switches', () => {
    const CASES = [
      // Local midnight is 22:00 UTC in summer.
      ['2026-09-25T22:00:05Z', '00:00:05'],
      // Spring forward: 02:00 local does not exist.
      ['2026-03-29T00:59:59Z', '01:59:59'],
      ['2026-03-29T01:00:00Z', '03:00:00'],
      // Fall back: 02:00 to 03:00 local happens twice.
      ['2026-10-25T00:59:59Z', '02:59:59'],
      ['2026-10-25T01:00:00Z', '02:00:00'],
      ['2026-01-04T12:00:00Z', '13:00:00'],
      ['2026-12-31T23:00:00Z', '00:00:00'],
    ] as const;

    for (const [iso, expected] of CASES) {
      expect(formatZurichTime(Date.parse(iso)), iso).toBe(expected);
    }
  });
});

describe('formatZurichDate', () => {
  it('prints the Zurich date without a comma before the year', () => {
    const CASES = [
      // Already the next day in Zurich.
      ['2026-09-25T22:00:05Z', 'Saturday, September 26 2026'],
      // The day is zero-padded, as moment's `DD` was.
      ['2026-01-04T12:00:00Z', 'Sunday, January 04 2026'],
      // The year rolls over in Zurich an hour before it does in UTC.
      ['2026-12-31T23:00:00Z', 'Friday, January 01 2027'],
    ] as const;

    for (const [iso, expected] of CASES) {
      expect(formatZurichDate(Date.parse(iso)), iso).toBe(expected);
    }
  });
});
