import { describe, expect, it } from 'vitest';

import { CATEGORIES, EXCLUDED, classify } from './categories.ts';
import type { Category } from './categories.ts';

/**
 * `RECON.md` §1 transcribed: every `(route_type, route_desc)` in
 * `otd-fp2026-20260919`, with the number of routes carrying it.
 *
 * It is here rather than derived from the registries on purpose. The registries
 * are the claim and this is the evidence, and a test that built one from the
 * other would pass no matter what either said. The route counts are what catch a
 * transcription slip: they add up to the feed's 5,170 or the table is wrong.
 */
const VOCABULARY: [routeType: string, routeDesc: string, routes: number][] = [
  ['100', 'ZUG', 1],
  ['101', 'TGV', 48],
  ['102', 'IC', 37],
  ['102', 'EC', 13],
  ['102', 'ICE', 8],
  ['102', 'RJX', 2],
  ['103', 'IR', 47],
  ['105', 'NJ', 7],
  ['106', 'R', 107],
  ['106', 'TER', 190],
  ['106', 'RE', 96],
  ['106', 'RB', 22],
  ['107', 'PE', 10],
  ['109', 'S', 178],
  ['109', 'SN', 34],
  ['116', 'CC', 13],
  ['117', 'EXT', 110],
  ['202', 'CAR', 1],
  ['401', 'M', 2],
  ['700', 'B', 3_099],
  ['700', 'EV', 330],
  ['702', 'EXB', 14],
  ['705', 'BN', 208],
  ['710', 'BP', 2],
  ['715', 'RUB', 79],
  ['900', 'T', 51],
  ['1000', 'BAT', 99],
  ['1000', 'FAE', 4],
  ['1300', 'GB', 93],
  ['1300', 'SL', 68],
  ['1300', 'PB', 135],
  ['1303', 'ASC', 2],
  ['1400', 'FUN', 53],
  ['1500', 'TX', 7],
];

/**
 * The issue's first acceptance criterion, as a list. Every mode that moves on
 * something other than a Swiss passenger rail, plus the special-event trains
 * that a `route_type` range would have let through.
 */
const NEVER_RIDEABLE = [
  ['bus', ['B', 'EV', 'EXB', 'BN', 'BP', 'RUB', 'CAR']],
  ['tram', ['T']],
  ['metro', ['M']],
  ['boat', ['BAT', 'FAE']],
  ['aerial lift', ['GB', 'SL', 'PB']],
  ['lift', ['ASC']],
  ['taxi', ['TX']],
  ['special-event train', ['EXT']],
] as const;

const typeOf = (code: string): string =>
  String(VOCABULARY.find(([, routeDesc]) => routeDesc === code)?.[0]);

describe('the recon vocabulary', () => {
  it('adds up to the 5,170 routes the feed holds', () => {
    const total = VOCABULARY.reduce((sum, [, , routes]) => sum + routes, 0);

    expect(total).toBe(5_170);
  });

  it('is covered end to end — no code is in both registries and none is in neither', () => {
    const unclassified = VOCABULARY.filter(
      ([, code]) => Object.hasOwn(CATEGORIES, code) === Object.hasOwn(EXCLUDED, code),
    );

    expect(unclassified.map(([, code]) => code)).toEqual([]);
  });

  it('agrees with both registries on which route_type each code sits on', () => {
    const wrong = VOCABULARY.filter(([routeType, code]) => {
      const facts = Object.hasOwn(CATEGORIES, code)
        ? CATEGORIES[code as Category]
        : EXCLUDED[code as keyof typeof EXCLUDED];

      return String(facts.routeType) !== routeType;
    });

    expect(wrong.map(([, code]) => code)).toEqual([]);
  });
});

describe('classify', () => {
  // The acceptance criterion: nothing on a rope, a road or a rubber tyre gets in.
  describe.each(NEVER_RIDEABLE)('%s', (_mode, codes) => {
    it.each(codes)('excludes %s', code => {
      expect(classify(code, typeOf(code))).toEqual({
        kind: 'excluded',
        reason: EXCLUDED[code as keyof typeof EXCLUDED].reason,
      });
    });
  });

  it('keeps 676 of the feed’s 5,170 routes', () => {
    const rideable = VOCABULARY.filter(
      ([routeType, code]) => classify(code, routeType).kind === 'included',
    ).reduce((sum, [, , routes]) => sum + routes, 0);

    expect(rideable).toBe(676);
  });

  it('includes every funicular and no other 1400', () => {
    expect(classify('FUN', '1400')).toEqual({ kind: 'included', category: 'FUN' });
  });

  it('includes TGV and RB but not TER', () => {
    // #468's call, and the one place the reasoning is testable: the first two
    // run Swiss-facing services, the third is a French network carried wholesale.
    expect(classify('TGV', '101').kind).toBe('included');
    expect(classify('RB', '106').kind).toBe('included');
    expect(classify('TER', '106')).toEqual({
      kind: 'excluded',
      reason: 'French regional network',
    });
  });

  it('normalises whitespace and case before looking a code up', () => {
    expect(classify('  s  ', '109')).toEqual({ kind: 'included', category: 'S' });
  });

  it('reports a known code on an unexpected route_type rather than trusting it', () => {
    // A feed that moves S off 109 has changed its vocabulary, and the pipeline
    // should say so rather than carry on filtering on a stale table.
    const verdict = classify('S', '700');

    expect(verdict.kind).toBe('unknown');
    expect(verdict).toMatchObject({ reason: expect.stringContaining('109') });
  });

  it('reports a code nobody has classified instead of dropping it', () => {
    expect(classify('XYZ', '106')).toEqual({
      kind: 'unknown',
      reason: 'XYZ is not in the category vocabulary',
    });
  });

  it('reports a blank or missing route_desc', () => {
    expect(classify(null, '106').kind).toBe('unknown');
    expect(classify('   ', '106').kind).toBe('unknown');
  });

  it('does not resolve a route_desc through the prototype', () => {
    // route_desc is operator-supplied text, so `toString` is a value it can hold.
    expect(classify('toString', '106').kind).toBe('unknown');
    expect(classify('constructor', '106').kind).toBe('unknown');
  });
});
