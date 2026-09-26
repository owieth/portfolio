import { describe, expect, it } from 'vitest';

import { allocate, classify, spread } from './commute.ts';

function tally(dealt: string[]): Record<string, number> {
  return dealt.reduce<Record<string, number>>(
    (counts, key) => ({ ...counts, [key]: (counts[key] ?? 0) + 1 }),
    {},
  );
}

describe('classify', () => {
  it('reads the place off the first line of a location', () => {
    expect(classify('Zug\nSwitzerland')).toBe('zug');
    expect(classify('Lucerne\nSwitzerland')).toBe('luzern');
  });

  it('maps the office addresses to their station', () => {
    expect(classify('Plattenstrasse 14\nZurich, Switzerland')).toBe('zurich');
    expect(classify('Sandacker 19\nMöriken AG, Switzerland')).toBe('wildegg');
  });

  it('returns undefined for somewhere new, so the caller can refuse the day', () => {
    expect(classify('Genève\nSwitzerland')).toBeUndefined();
    expect(classify('')).toBeUndefined();
  });
});

describe('allocate', () => {
  it('divides a pool by share, summing to the pool and not to the rounding', () => {
    const counts = allocate(
      [
        { line: 'IC1', share: 0.9 },
        { line: 'IC8', share: 0.1 },
      ],
      424,
    );

    expect(counts).toEqual([
      { key: 'IC1', count: 382 },
      { key: 'IC8', count: 42 },
    ]);
  });

  it('takes fixed counts off the top and shares out what is left', () => {
    // The real Zürich–Zug pool: 30 S24 legs, then 70/5/25 over the other 360.
    expect(
      allocate(
        [
          { line: 'S24', count: 30 },
          { line: 'IR75', share: 0.7 },
          { line: 'IR70', share: 0.05 },
          { line: 'EC', share: 0.25 },
        ],
        390,
      ),
    ).toEqual([
      { key: 'S24', count: 30 },
      { key: 'IR75', count: 252 },
      { key: 'IR70', count: 18 },
      { key: 'EC', count: 90 },
    ]);
  });

  it('gives a single line the whole pool', () => {
    expect(allocate([{ line: 'S9' }], 7)).toEqual([{ key: 'S9', count: 7 }]);
  });

  it('refuses a pool too small for its fixed counts', () => {
    expect(() => allocate([{ line: 'S24', count: 30 }], 12)).toThrow(/cannot hold 30/);
  });
});

describe('spread', () => {
  it('deals exactly the counts it is given', () => {
    const dealt = spread(
      [
        { key: 'IR75', count: 252 },
        { key: 'IR70', count: 18 },
        { key: 'EC', count: 90 },
        { key: 'S24', count: 30 },
      ],
      390,
    );

    expect(dealt).toHaveLength(390);
    expect(tally(dealt)).toEqual({ IR75: 252, IR70: 18, EC: 90, S24: 30 });
  });

  it('interleaves rather than blocking, so a rare line is not all in one year', () => {
    const dealt = spread(
      [
        { key: 'common', count: 18 },
        { key: 'rare', count: 2 },
      ],
      20,
    );

    // Both halves of the run get one of the two rare legs.
    expect(dealt.slice(0, 10)).toContain('rare');
    expect(dealt.slice(10)).toContain('rare');
  });

  it('is deterministic, so the same export always seeds the same rows', () => {
    const counts = [
      { key: 'a', count: 5 },
      { key: 'b', count: 3 },
    ];

    expect(spread(counts, 8)).toEqual(spread(counts, 8));
  });

  it('refuses counts that do not fill the pool', () => {
    expect(() => spread([{ key: 'a', count: 2 }], 3)).toThrow(/fewer than 3/);
  });
});
