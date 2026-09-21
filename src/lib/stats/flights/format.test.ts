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
    // The separator de-CH emits is U+2019, a right single quotation mark, not
    // an ASCII apostrophe. Written as an escape so a copy-paste cannot lie.
    expect(formatDistanceKm(36_253.8)).toBe('36’254 km');
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
