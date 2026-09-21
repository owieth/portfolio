import { describe, expect, it } from 'vitest';

import { MAP_SIZE, MAP_WINDOW } from '@/lib/stats/flights/projection';
import { WORLD_PATH, WORLD_PATH_WINDOW } from '@/lib/stats/flights/world-path';

const numbers = WORLD_PATH.split(/[MLZ]/)
  .flatMap(pair => pair.split(' '))
  .filter(Boolean)
  .map(Number);

describe('WORLD_PATH_WINDOW', () => {
  it('is the window the path was generated against', () => {
    // The drift guard, and the whole reason the generator writes the window
    // out beside the path. Retune MAP_WINDOW without `pnpm og:world` and the
    // coastlines stop lining up with the routes drawn over them — silently,
    // because both halves still render perfectly well on their own.
    expect(WORLD_PATH_WINDOW).toEqual(MAP_WINDOW);
  });
});

describe('WORLD_PATH', () => {
  it('is a path of moves, lines and closes, and nothing else', () => {
    // Curves, relative commands and arcs would all be valid SVG and none of
    // them survive the parsing this test does — so pin the grammar.
    expect(WORLD_PATH).toMatch(/^M[\d .\-MLZ]+Z$/);
  });

  it('carries no NaN, no Infinity and no undefined', () => {
    // One assertion for every classic projection bug at once: a missing
    // coordinate, a divide by a zero-width window, a point read off the wrong
    // axis. All three land in the string as text rather than as a number.
    expect(WORLD_PATH).not.toMatch(/NaN|Infinity|undefined|null/);
  });

  it('stays inside the frame it was projected into', () => {
    // A pixel of slack for the rounding. Anything further out means the path
    // and MAP_SIZE disagree about how big the map is.
    for (const value of numbers) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(-1);
    }

    const xs = numbers.filter((_, index) => index % 2 === 0);
    const ys = numbers.filter((_, index) => index % 2 === 1);

    expect(Math.max(...xs)).toBeLessThanOrEqual(MAP_SIZE.width + 1);
    expect(Math.max(...ys)).toBeLessThanOrEqual(MAP_SIZE.height + 1);
  });

  it('is detailed enough to read as continents and small enough to embed', () => {
    // The floor catches a generator that dropped every ring; the ceiling
    // catches one that forgot to round, which quadruples the string and with
    // it the size of every render of the card.
    expect(WORLD_PATH.length).toBeGreaterThan(2_000);
    expect(WORLD_PATH.length).toBeLessThan(60_000);
  });

  it('closes every ring it opens', () => {
    expect(WORLD_PATH.match(/M/g)!.length).toBe(WORLD_PATH.match(/Z/g)!.length);
  });
});
