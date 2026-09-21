import { describe, expect, it } from 'vitest';

import { formatDistanceKm, formatDuration } from '@/lib/stats/flights/format';

describe('formatDuration', () => {
  it('formats the boundaries', () => {
    const CASES = [
      // The three the page actually shows: the lifetime total, the longest
      // single flight, and a short hop.
      [3700, '2d 13h'],
      [505, '8h 25m'],
      [45, '45m'],
      // Exact boundaries, where the smaller unit is dropped rather than
      // printed as a zero.
      [1440, '1d'],
      [2880, '2d'],
      [60, '1h'],
      [120, '2h'],
      // Either side of a boundary, which is where an off-by-one hides.
      [1439, '23h 59m'],
      [1441, '1d'],
      [59, '59m'],
      [61, '1h 1m'],
      [0, '0m'],
    ] as const;

    for (const [minutes, expected] of CASES) {
      expect(formatDuration(minutes), `${minutes}`).toBe(expected);
    }
  });
});

describe('formatDistanceKm', () => {
  it('groups thousands the Swiss way', () => {
    // The separator is U+2019, a right single quotation mark, not an ASCII
    // apostrophe.
    expect(formatDistanceKm(36_253.8)).toBe('36’254 km');
  });

  it('pins the separator rather than inheriting it from the runtime', () => {
    // CLDR 48 changed de-CH's group separator from U+2019 to a plain
    // apostrophe, so Intl answers differently depending on the ICU the
    // runtime ships — Node 24.12 is on CLDR 47 and Node 22.23 on CLDR 48,
    // which is how this first surfaced: green locally, red in CI. The page
    // is server-rendered and then hydrated, so a separator that tracks the
    // runtime is a hydration mismatch waiting on the wrong pair.
    const fromRuntime = new Intl.NumberFormat('de-CH', {
      maximumFractionDigits: 0,
    }).format(36_254);

    expect(formatDistanceKm(36_253.8)).not.toContain(String.fromCharCode(39));
    expect(formatDistanceKm(36_253.8)).toContain(String.fromCharCode(8217));
    // Holds whether or not this runtime's ICU agrees with the pin, so the
    // test cannot go green for the wrong reason on a future Node.
    expect(fromRuntime.replace(/['’]/g, '!')).toBe('36!254');
  });

  it('rounds to whole kilometres', () => {
    expect(formatDistanceKm(787.6)).toBe('788 km');
    expect(formatDistanceKm(787.4)).toBe('787 km');
  });

  it('leaves small numbers ungrouped', () => {
    expect(formatDistanceKm(0)).toBe('0 km');
    expect(formatDistanceKm(856.5)).toBe('857 km');
  });
});
