import { describe, expect, it } from 'vitest';

import type { Category } from '../allowlist/categories.ts';
import type { Operator } from '../naming/operators.ts';
import {
  isAlternate,
  isDisused,
  lineRefs,
  namesAnotherLine,
  normaliseOperator,
  operatorMatches,
  operatorNames,
  relationRefs,
  routeTypeOf,
} from './rules.ts';

describe('isDisused and isAlternate', () => {
  it.each([
    [{}, false, false],
    [{ state: 'alternate' }, false, true],
    [{ state: 'connection' }, false, true],
    [{ disused: 'yes' }, true, false],
  ])('%o → disused %s, alternate %s', (tags, disused, alternate) => {
    expect(isDisused(tags)).toBe(disused);
    expect(isAlternate(tags)).toBe(alternate);
  });
});

describe('routeTypeOf', () => {
  it('sends funiculars to route=funicular and everything else to route=train', () => {
    expect(routeTypeOf('FUN')).toBe('funicular');
    expect(routeTypeOf('CC')).toBe('train');
    expect(routeTypeOf('S')).toBe('train');
  });
});

describe('lineRefs and relationRefs', () => {
  it('meet on a number that already says its category', () => {
    expect([...lineRefs('IR', 'IR35')]).toEqual(['IR35']);
    expect(relationRefs('IR 35').has('IR35')).toBe(true);
  });

  it('put the category in front of a bare number', () => {
    expect([...lineRefs('ICE', '3')]).toEqual(['3', 'ICE3']);
    expect(relationRefs('ICE 3').has('ICE3')).toBe(true);
  });

  it('also spell a letter code after the category on its own, as OSM does for the Léman Express', () => {
    expect([...lineRefs('R', 'RL1')]).toEqual(['RL1', 'L1']);
    expect([...lineRefs('SN', 'SN4')]).toEqual(['SN4']);
  });

  it('give a line with no number nothing to match', () => {
    expect(lineRefs('IC', null).size).toBe(0);
  });

  it('split a relation that carries two lines', () => {
    expect([...relationRefs('S11; S12')]).toEqual(['S11', 'S12']);
  });

  it('give a relation with no ref nothing to match', () => {
    expect(relationRefs(undefined).size).toBe(0);
    expect(relationRefs(' ; ').size).toBe(0);
  });
});

describe('operators', () => {
  const TABLE: Operator[] = [
    { id: '33', name: 'BLS AG (bls)', short: 'BLS' },
    { id: '72', name: 'Rhätische Bahn', short: 'RhB' },
  ];

  it('normalises case, accents and punctuation away', () => {
    expect(normaliseOperator('Matterhorn Gotthard Bahn (fo)')).toBe('matterhorn gotthard bahn fo');
    expect(normaliseOperator('Rhätische Bahn')).toBe('rhatische bahn');
  });

  it('know a line operator by its feed name and its short form', () => {
    const names = operatorNames(['Rhätische Bahn', 'Schweizerische Bundesbahnen SBB'], TABLE);

    expect(names).toEqual(['rhatische bahn', 'rhb', 'schweizerische bundesbahnen sbb']);
    expect(operatorMatches('RhB', names)).toBe(true);
    expect(operatorMatches('Rhätische Bahn', names)).toBe(true);
  });

  it('find a short form inside the feed name, as whole words only', () => {
    const names = operatorNames(['Schweizerische Bundesbahnen SBB', 'Regionalverkehr Bern-Solothurn'], []);

    expect(operatorMatches('SBB', names)).toBe(true);
    expect(operatorMatches('RB', names)).toBe(false);
    expect(operatorMatches('Bundes', names)).toBe(false);
  });

  it('try each operator of a relation run by two', () => {
    expect(operatorMatches('SNCF; BLS', operatorNames(['BLS AG (bls)'], TABLE))).toBe(true);
  });

  it('match nothing on a relation with no operator', () => {
    expect(operatorMatches(undefined, operatorNames(['BLS AG (bls)'], TABLE))).toBe(false);
  });
});

describe('namesAnotherLine', () => {
  const CASES: [string, string, Category, string | null, boolean][] = [
    ['an ICE to an unnumbered IC', 'ICE20', 'IC', null, true],
    ['an IC of another number', 'IC4', 'RE', 'RE48', true],
    ['an IC to an unnumbered IC', 'IC4', 'IC', null, false],
    ['a railjet to an EC', 'RJ', 'EC', null, true],
    ['a railjet to the feed’s RJX', 'RJ', 'RJX', null, false],
    ['a EuroNight to the feed’s NJ, whatever its train number', 'EN40462', 'NJ', null, false],
    ['the same number under another category', 'RE41', 'R', 'R41', false],
    ['a timetable field under the same category', 'R312', 'R', 'R61', false],
    ['a timetable field after ZUG', 'ZUG475', 'CC', '7', false],
    ['a ref with no category', 'L5', 'R', 'RL6', false],
    ['a name', 'MINIFUNIC', 'FUN', null, false],
  ];

  it.each(CASES)('%s: %s → %s', (_label, ref, category, number, expected) => {
    expect(namesAnotherLine(new Set([ref]), category, number)).toBe(expected);
  });
});
