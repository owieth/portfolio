import { describe, expect, it } from 'vitest';

import { assign, operatorSlug, parseRules, verify } from './rules.ts';
import type { RouteFacts, Rule } from './rules.ts';

const ZUERICH_HB = { didok: '8503000', name: 'Zürich HB' };
const BERN = { didok: '8507000', name: 'Bern' };
const LUZERN = { didok: '8505000', name: 'Luzern' };
const SBB = { id: '11', name: 'Schweizerische Bundesbahnen SBB' };
const RHB = { id: '72', name: 'Rhätische Bahn' };

function route(
  facts: Partial<Omit<RouteFacts, 'stations'>> & { stations?: string[] },
): RouteFacts {
  return {
    category: facts.category ?? 'S',
    agencyId: facts.agencyId ?? SBB.id,
    shortName: facts.shortName === undefined ? 'S1' : facts.shortName,
    stations: new Set(facts.stations ?? []),
  };
}

const regions = {
  fernverkehr: 'Long distance',
  's-bahn-zuerich': 'S-Bahn Zürich',
  's-bahn-bern': 'S-Bahn Bern',
};

describe('parseRules', () => {
  it('accepts a well-formed file', () => {
    const json = {
      regions,
      rules: [
        { region: 'fernverkehr', categories: ['IC', 'IR'] },
        { region: 's-bahn-zuerich', serves: [ZUERICH_HB] },
        {
          region: 's-bahn-bern',
          agencies: [SBB],
          lines: ['S1'],
          serves: [BERN],
          note: 'why',
        },
        { byOperator: true, categories: ['FUN'] },
      ],
    };

    expect(parseRules(json, 'regions.json')).toEqual(json);
  });

  it('rejects a file without a regions map and a rules list', () => {
    expect(() => parseRules({ rules: [] }, 'regions.json')).toThrow(
      'regions.json must be an object with a "regions" map and a "rules" list',
    );
  });

  /**
   * Every problem at once, each naming its rule by position, so a bad edit is
   * fixed in one pass rather than one rerun per typo.
   */
  it('reports every problem in every rule, by position', () => {
    const json = {
      regions,
      rules: [
        { region: 'fernverkehr', categories: ['IC'] },
        { region: 's-bahn-zuerich', byOperator: true, serves: [ZUERICH_HB] },
        { region: 's-bahn-basel', serves: [ZUERICH_HB] },
        { region: 's-bahn-bern', categories: ['BUS'], serves: [{ didok: '8507000' }] },
        { region: 's-bahn-bern', station: [BERN] },
        { byOperator: false, lines: [] },
      ],
    };

    let message = '';

    try {
      parseRules(json, 'regions.json');
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message.split('\n')).toEqual([
      'regions.json: rule 2 needs exactly one of "region" and "byOperator"',
      'regions.json: rule 3 names region "s-bahn-basel", which "regions" does not declare',
      'regions.json: rule 4 names category "BUS", which allowlist/categories.ts does not',
      'regions.json: rule 4 needs "didok" and "name" on every entry in "serves", got {"didok":"8507000"}',
      'regions.json: rule 5 has an unknown key "station"',
      'regions.json: rule 5 matches everything; give it "categories", "agencies", "lines" or "serves"',
      'regions.json: rule 6 can only set "byOperator" to true',
      'regions.json: rule 6 "lines" must be a non-empty list',
    ]);
  });

  it('rejects a region slug that could not go into a line id', () => {
    expect(() =>
      parseRules(
        {
          regions: { 'S-Bahn Zürich': 'S-Bahn Zürich' },
          rules: [{ region: 'S-Bahn Zürich', lines: ['S1'] }],
        },
        'regions.json',
      ),
    ).toThrow('region "S-Bahn Zürich" is not lowercase-kebab-case ASCII');
  });

  it('rejects a region no rule uses, which would otherwise be a typo nobody sees', () => {
    expect(() =>
      parseRules(
        { regions, rules: [{ region: 'fernverkehr', categories: ['IC'] }] },
        'regions.json',
      ),
    ).toThrow('region s-bahn-zuerich is declared but no rule files anything under it');
  });
});

describe('assign', () => {
  const rules: Rule[] = [
    { region: 'fernverkehr', categories: ['IC'] },
    { region: 's-bahn-bern', agencies: [RHB], lines: ['S1'] },
    { region: 's-bahn-zuerich', serves: [LUZERN, ZUERICH_HB] },
    { region: 's-bahn-bern', serves: [BERN] },
    { byOperator: true, categories: ['FUN'] },
  ];

  it('takes the first rule that matches, not the best one', () => {
    const match = assign(route({ stations: [ZUERICH_HB.didok, BERN.didok] }), rules);

    expect(match).toMatchObject({ rule: { region: 's-bahn-zuerich' }, position: 3 });
  });

  it('reports the anchor that decided it, in the rule’s own order', () => {
    const match = assign(route({ stations: [ZUERICH_HB.didok, LUZERN.didok] }), rules);

    expect(match?.via).toEqual(LUZERN);
  });

  it('requires every predicate of a rule to hold', () => {
    expect(assign(route({ agencyId: RHB.id, shortName: 'S1' }), rules)).toMatchObject({
      position: 2,
      via: null,
    });
    expect(assign(route({ agencyId: RHB.id, shortName: 'S2' }), rules)).toBeNull();
    expect(assign(route({ agencyId: RHB.id, shortName: null }), rules)).toBeNull();
  });

  it('matches on category alone when that is all a rule asks', () => {
    expect(
      assign(route({ category: 'IC', stations: [BERN.didok] }), rules)?.position,
    ).toBe(1);
    expect(assign(route({ category: 'FUN' }), rules)?.rule).toEqual({
      byOperator: true,
      categories: ['FUN'],
    });
  });

  it('matches nothing when no rule holds', () => {
    expect(assign(route({ stations: ['8501120'] }), rules)).toBeNull();
  });
});

describe('operatorSlug', () => {
  it.each([
    ['Schweizerische Bundesbahnen SBB', 'schweizerische-bundesbahnen-sbb'],
    ['Schweizerische Südostbahn (sob)', 'schweizerische-suedostbahn-sob'],
    ['Rhätische Bahn', 'rhaetische-bahn'],
    ['Österreichische Bundesbahnen', 'oesterreichische-bundesbahnen'],
    [
      'Société Nationale des Chemins de fer Français',
      'societe-nationale-des-chemins-de-fer-francais',
    ],
    ['Lugano-Ponte Tresa', 'lugano-ponte-tresa'],
    ['', 'unknown-operator'],
  ])('%s is %s', (name, slug) => {
    expect(operatorSlug(name)).toBe(slug);
  });
});

describe('verify', () => {
  it('says which reference the feed does not back up, and how', () => {
    const rules: Rule[] = [
      {
        region: 's-bahn-bern',
        agencies: [SBB],
        serves: [BERN, { didok: '8503000', name: 'Zürich' }],
      },
      { region: 's-bahn-bern', agencies: [RHB], serves: [LUZERN] },
    ];

    expect(
      verify(rules, {
        stations: new Map([
          [BERN.didok, BERN.name],
          [ZUERICH_HB.didok, ZUERICH_HB.name],
        ]),
        agencies: new Map([[SBB.id, SBB.name]]),
      }),
    ).toEqual([
      'rule 1: station 8503000 is Zürich HB in the feed, not Zürich',
      'rule 2: station 8505000 Luzern is not in the feed',
      'rule 2: agency 72 Rhätische Bahn is not in the feed',
    ]);
  });
});
