import { describe, expect, it } from 'vitest';

import type { OsmPoint } from '../overpass.ts';
import { linemerge } from './linemerge.ts';
import type { Way } from './linemerge.ts';

/**
 * Points on a grid, named by letter so a test reads as the walk it expects:
 * `way(1, 'abc')` is way 1 through a, b and c.
 */
const GRID: Record<string, OsmPoint> = Object.fromEntries(
  [...'abcdefghij'].map((name, index) => [name, { lat: 46 + index / 100, lon: 7 + index / 100 }]),
);

function way(id: number, names: string): Way {
  return { id, points: [...names].map(name => GRID[name] as OsmPoint) };
}

function names(parts: OsmPoint[][]): string[] {
  const byKey = new Map(Object.entries(GRID).map(([name, point]) => [`${point.lat},${point.lon}`, name]));

  return parts.map(part => part.map(point => byKey.get(`${point.lat},${point.lon}`)).join(''));
}

describe('linemerge', () => {
  it('returns nothing for no ways', () => {
    expect(linemerge([])).toEqual([]);
  });

  it('keeps a single way as it is', () => {
    expect(names(linemerge([way(1, 'abc')]))).toEqual(['abc']);
  });

  it('joins ways that meet end to end', () => {
    expect(names(linemerge([way(1, 'ab'), way(2, 'bc'), way(3, 'cd')]))).toEqual(['abcd']);
  });

  it('reverses a way that runs the other way', () => {
    expect(names(linemerge([way(1, 'ab'), way(2, 'cb'), way(3, 'dc')]))).toEqual(['abcd']);
  });

  it('joins members listed out of running order, in the direction of the first', () => {
    expect(names(linemerge([way(2, 'bc'), way(3, 'cd'), way(1, 'ab')]))).toEqual(['abcd']);
    expect(names(linemerge([way(2, 'cb'), way(1, 'ab'), way(3, 'dc')]))).toEqual(['dcba']);
  });

  // Two per-direction relations of one line list the same ways.
  it('uses a way that appears twice only once', () => {
    expect(names(linemerge([way(1, 'ab'), way(2, 'bc'), way(2, 'bc'), way(1, 'ab')]))).toEqual([
      'abc',
    ]);
  });

  it('leaves a gap open rather than bridging it', () => {
    expect(names(linemerge([way(1, 'ab'), way(2, 'bc'), way(3, 'ef'), way(4, 'fg')]))).toEqual([
      'abc',
      'efg',
    ]);
  });

  it('stops at a junction, so a branch is three strings', () => {
    expect(names(linemerge([way(1, 'ab'), way(2, 'bc'), way(3, 'bd'), way(4, 'de')]))).toEqual([
      'ab',
      'bc',
      'bde',
    ]);
  });

  it('closes a ring without walking it twice', () => {
    expect(names(linemerge([way(1, 'abc'), way(2, 'cda')]))).toEqual(['abcda']);
    expect(names(linemerge([way(1, 'abca')]))).toEqual(['abca']);
  });

  it('drops a way with fewer than two points', () => {
    expect(names(linemerge([way(1, 'a'), way(2, 'bc')]))).toEqual(['bc']);
  });

  it('gives the same strings for the same members every time', () => {
    const ways = [way(3, 'dc'), way(1, 'ab'), way(2, 'cb'), way(4, 'fg')];

    expect(linemerge(ways)).toEqual(linemerge(ways));
  });
});
