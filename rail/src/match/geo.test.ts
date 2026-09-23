import { describe, expect, it } from 'vitest';

import { metres, metresToLine, metresToLines } from './geo.ts';

const ZUERICH_HB = { lat: 47.378177, lon: 8.540212 };
const BERN = { lat: 46.948832, lon: 7.439136 };

describe('metres', () => {
  it('is zero from a point to itself', () => {
    expect(metres(BERN, BERN)).toBe(0);
  });

  it('gives Zürich HB to Bern as the crow flies', () => {
    expect(metres(ZUERICH_HB, BERN) / 1000).toBeCloseTo(95.5, 0);
  });
});

describe('metresToLine', () => {
  // A kilometre of track due east along 47° N.
  const TRACK = [
    { lat: 47, lon: 8 },
    { lat: 47, lon: 8.0131 },
  ];

  it('measures square to the segment beside it', () => {
    expect(metresToLine({ lat: 47.001, lon: 8.005 }, TRACK)).toBeCloseTo(111, 0);
  });

  it('measures to the nearer end past either end', () => {
    const past = { lat: 47, lon: 7.99 };

    expect(metresToLine(past, TRACK)).toBeCloseTo(metres(past, TRACK[0]!), 0);
  });

  it('treats a single point as a point', () => {
    expect(metresToLine(BERN, [BERN])).toBe(0);
  });

  it('is infinitely far from nothing', () => {
    expect(metresToLine(BERN, [])).toBe(Infinity);
    expect(metresToLines(BERN, [])).toBe(Infinity);
  });

  it('takes the nearest of several lines', () => {
    expect(metresToLines(BERN, [TRACK, [BERN, ZUERICH_HB]])).toBe(0);
  });
});
