import { describe, expect, it } from 'vitest';

import type { Pattern } from '../patterns.ts';
import {
  compactNumber,
  compare,
  components,
  dominantPattern,
  lineId,
  terminals,
} from './key.ts';

function pattern(overrides: Partial<Pattern>): Pattern {
  return {
    routeId: 'r',
    hash: '0000000000000000',
    stations: ['8503000', '8503001'],
    trips: 1,
    runs: 1,
    ...overrides,
  };
}

describe('compare', () => {
  it('orders by code unit, so an upper-case letter sorts before every lower-case one', () => {
    expect(['b', 'a', 'B', 'Ä'].sort(compare)).toEqual(['B', 'a', 'b', 'Ä']);
  });
});

describe('dominantPattern', () => {
  it('prefers the pattern that runs most', () => {
    const busy = pattern({ hash: 'b', runs: 300, trips: 1 });
    const many = pattern({ hash: 'a', runs: 20, trips: 40 });

    expect(dominantPattern([many, busy])).toBe(busy);
  });

  it('breaks a tie in runs by trips', () => {
    const more = pattern({ hash: 'b', runs: 100, trips: 4 });
    const fewer = pattern({ hash: 'a', runs: 100, trips: 2 });

    expect(dominantPattern([fewer, more])).toBe(more);
  });

  it('breaks a tie in both by the lowest hash, whatever the input order', () => {
    const low = pattern({ hash: '0a', runs: 100, trips: 2 });
    const high = pattern({ hash: '0b', runs: 100, trips: 2 });

    expect(dominantPattern([high, low])).toBe(low);
    expect(dominantPattern([low, high])).toBe(low);
  });

  it('has nothing to say about no patterns', () => {
    expect(dominantPattern([])).toBeNull();
  });
});

describe('terminals', () => {
  it('returns the two ends in Didok order, so both directions give one pair', () => {
    const up = pattern({ stations: ['8509002', '8509010', '8509000'] });
    const down = pattern({ stations: ['8509000', '8509010', '8509002'] });

    expect(terminals(up)).toEqual(['8509000', '8509002']);
    expect(terminals(down)).toEqual(['8509000', '8509002']);
  });

  it('gives a loop that ends where it started the same station twice', () => {
    expect(terminals(pattern({ stations: ['8503000', '8503010', '8503000'] }))).toEqual([
      '8503000',
      '8503000',
    ]);
  });
});

describe('compactNumber', () => {
  it('drops whitespace, so a stray space does not make a second line', () => {
    expect(compactNumber('RE 33')).toBe('RE33');
    expect(compactNumber('S10')).toBe('S10');
  });

  it('refuses a number that could spell a different id', () => {
    expect(compactNumber('S1:2')).toBeNull();
    expect(compactNumber('S/1')).toBeNull();
  });
});

describe('lineId', () => {
  it('is region and number for a numbered line', () => {
    expect(lineId({ region: 's-bahn-zuerich', category: 'S', number: 'S10' })).toBe(
      's-bahn-zuerich:S10',
    );
  });

  it('puts the category in front of a number that does not carry it', () => {
    expect(lineId({ region: 'fernverkehr', category: 'ICE', number: '3' })).toBe(
      'fernverkehr:ICE-3',
    );
    expect(lineId({ region: 'fernverkehr', category: 'NJ', number: '3' })).toBe(
      'fernverkehr:NJ-3',
    );
    expect(lineId({ region: 'pilatus-bahnen', category: 'CC', number: 'T7' })).toBe(
      'pilatus-bahnen:CC-T7',
    );
  });

  it('is region, category and terminals for a line without one', () => {
    expect(
      lineId({
        region: 'fernverkehr',
        category: 'IC',
        number: null,
        terminals: ['8503000', '8506302'],
      }),
    ).toBe('fernverkehr:IC:8503000-8506302');
  });
});

describe('components', () => {
  it('joins routes that share a station, transitively', () => {
    const parts = components(
      new Map([
        ['c', new Set(['3', '4'])],
        ['a', new Set(['1', '2'])],
        ['b', new Set(['2', '3'])],
      ]),
    );

    expect(parts).toEqual([['a', 'b', 'c']]);
  });

  it('keeps routes that share nothing apart, in a fixed order', () => {
    const parts = components(
      new Map([
        ['z', new Set(['8'])],
        ['b', new Set(['1', '2'])],
        ['a', new Set(['2'])],
        ['y', new Set(['8', '9'])],
      ]),
    );

    expect(parts).toEqual([
      ['a', 'b'],
      ['y', 'z'],
    ]);
  });
});
