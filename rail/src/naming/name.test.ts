import { describe, expect, it } from 'vitest';

import { derivedName, namingCandidate, numberedName, terminalNames } from './name.ts';
import type { Candidate } from './name.ts';

function candidate(overrides: Partial<Candidate>): Candidate {
  return {
    stops: 10,
    trips: 50,
    terminals: ['Davos Platz', 'Landquart'],
    operator: 'RhB',
    ...overrides,
  };
}

const NAMES = new Map([
  ['8509000', 'Chur'],
  ['8509002', 'Landquart'],
  ['8509073', 'Davos Platz'],
]);

describe('terminalNames', () => {
  it('names the two ends in code-unit order, so both directions give one pair', () => {
    expect(terminalNames(['8509002', '8509000', '8509073'], NAMES)).toEqual([
      'Davos Platz',
      'Landquart',
    ]);
    expect(terminalNames(['8509073', '8509000', '8509002'], NAMES)).toEqual([
      'Davos Platz',
      'Landquart',
    ]);
  });

  it('keeps the Didok number of a station it has no name for', () => {
    expect(terminalNames(['8509002', '8599999'], NAMES)).toEqual(['8599999', 'Landquart']);
  });
});

describe('namingCandidate', () => {
  it('prefers the longest pattern over a busier short-turn', () => {
    const long = candidate({ stops: 12, trips: 10 });
    const busy = candidate({ stops: 8, trips: 90, terminals: ['Chur', 'Landquart'] });

    expect(namingCandidate([busy, long])).toBe(long);
  });

  it('breaks a tie in length by trips', () => {
    const more = candidate({ trips: 60, terminals: ['Klosters Platz', 'Landquart'] });
    const fewer = candidate({ trips: 40 });

    expect(namingCandidate([fewer, more])).toBe(more);
  });

  /**
   * The two-terminal tie the issue asks to have documented. RhB runs two
   * patterns out of Landquart that are equally long and equally busy, one to
   * Davos Platz and one to Klosters Platz. Nothing about the timetable prefers
   * either, so the lexical order of the terminal names decides: the pair is
   * compared first name first, `Davos Platz` sorts before `Klosters Platz`, and
   * the line is `… Davos Platz-Landquart` on every run and in every input order.
   */
  it('breaks a tie in length and trips by the lexical order of the terminal names', () => {
    const davos = candidate({ terminals: ['Davos Platz', 'Landquart'] });
    const klosters = candidate({ terminals: ['Klosters Platz', 'Landquart'] });

    expect(namingCandidate([davos, klosters])).toBe(davos);
    expect(namingCandidate([klosters, davos])).toBe(davos);
  });

  it('compares the second terminal when the first is shared', () => {
    const landquart = candidate({ terminals: ['Davos Platz', 'Landquart'] });
    const chur = candidate({ terminals: ['Chur', 'Davos Platz'] });
    const filisur = candidate({ terminals: ['Davos Platz', 'Filisur'] });

    expect(namingCandidate([landquart, filisur])).toBe(filisur);
    expect(namingCandidate([landquart, filisur, chur])).toBe(chur);
  });

  it('breaks a tie in everything else by operator, whatever the input order', () => {
    const rhb = candidate({ operator: 'RhB' });
    const sbb = candidate({ operator: 'SBB' });

    expect(namingCandidate([sbb, rhb])).toBe(rhb);
    expect(namingCandidate([rhb, sbb])).toBe(rhb);
  });

  it('has nothing to say about no patterns', () => {
    expect(namingCandidate([])).toBeNull();
  });
});

describe('derivedName', () => {
  it('puts operator, category and terminals together', () => {
    expect(
      derivedName({ category: 'R', operator: 'RhB', terminals: ['Davos Platz', 'Landquart'] }),
    ).toBe('RhB R Davos Platz-Landquart');
  });

  it('names a funicular for its operator alone', () => {
    expect(
      derivedName({
        category: 'FUN',
        operator: 'Polybahn',
        terminals: ['Zürich Central (Polybahn)', 'Zürich Polyterrasse'],
      }),
    ).toBe('Standseilbahn Polybahn');
  });

  it('adds the terminals to a funicular that needs telling apart', () => {
    expect(
      derivedName({
        category: 'FUN',
        operator: 'transN',
        terminals: ['Neuchâtel, Ecluse (FUNI)', 'Neuchâtel, Plan (FUNI)'],
        withTerminals: true,
      }),
    ).toBe('Standseilbahn transN Neuchâtel, Ecluse (FUNI)-Neuchâtel, Plan (FUNI)');
  });

  it('leaves out ZUG, which names no category and reads as the city', () => {
    expect(
      derivedName({ category: 'ZUG', operator: 'SNCF', terminals: ['Genève', 'Lyon'] }),
    ).toBe('SNCF Genève-Lyon');
  });
});

describe('numberedName', () => {
  it('uses a number that already says its category as it is', () => {
    expect(numberedName('IR', 'IR35')).toBe('IR35');
  });

  it('puts the category in front of a bare number', () => {
    expect(numberedName('ICE', '3')).toBe('ICE 3');
  });
});
