import { beforeEach, describe, expect, it } from 'vitest';

import type { Category } from './allowlist/categories.ts';
import { mergeLines } from './merge.ts';
import { nameLines } from './naming.ts';
import type { NamingInput } from './naming.ts';
import type { Operator } from './naming/operators.ts';
import type { Pattern } from './patterns.ts';
import type { RegionedRoute } from './regions.ts';
import type { Station } from './stations.ts';

/**
 * Values rather than a feed on disk: the step opens nothing, so its fixture is
 * what the earlier steps would have handed it, with the lines made by the real
 * merge step rather than written out by hand.
 *
 * RhB's unnumbered `R` is the case the issue named, both directions and a busier
 * short-turn that is not the longest. Around it: two numbered lines that keep
 * their numbers, the Polybahn, TPN's two funiculars that share an operator, a
 * line by an operator the table does not know, `ZUG`, and two unnumbered lines
 * in two regions that come out with one name.
 */
const SBB = { id: '11', name: 'Schweizerische Bundesbahnen SBB' };
const RHB = { id: '72', name: 'Rhätische Bahn' };
const POLYBAHN = { id: '165', name: 'Poly-Bahn Zürich' };
const TPN = { id: '15300', name: 'Transports Publics Neuchâtelois SA' };
const SNCF = { id: '87_LEX', name: 'Société Nationale des Chemins de fer Français' };
const UNKNOWN = { id: '999', name: 'Unbekannte Bahn AG' };

const OPERATORS: Operator[] = [
  { ...SBB, short: 'SBB' },
  { ...RHB, short: 'RhB' },
  { ...POLYBAHN, short: 'Polybahn' },
  { ...TPN, short: 'transN' },
  { ...SNCF, short: 'SNCF' },
];

function route(
  routeId: string,
  category: Category,
  shortName: string | null,
  region: string,
  agency: { id: string; name: string },
): RegionedRoute {
  return {
    routeId,
    agencyId: agency.id,
    shortName,
    category,
    operator: agency.name,
    region,
    source: 'rule',
  };
}

function pattern(routeId: string, stations: string[], trips = 10, runs = 300): Pattern {
  return { routeId, hash: stations.join('').slice(-16), stations, trips, runs };
}

function station(didok: string, name: string): Station {
  return { didok, sloid: null, name, lat: null, lon: null, stops: 0 };
}

const STATIONS: Station[] = [
  station('8509002', 'Landquart'),
  station('8509000', 'Chur'),
  station('8509065', 'Klosters Platz'),
  station('8509073', 'Davos Platz'),
  station('8503000', 'Zürich HB'),
  station('8507000', 'Bern'),
  station('8503099', 'Zürich Central (Polybahn)'),
  station('8503098', 'Zürich Polyterrasse'),
  station('8504221', 'Neuchâtel'),
  station('8530050', 'Neuchâtel, La Coudre (FUNI)'),
  station('8530051', 'Chaumont (FUNI)'),
  station('8530052', 'Neuchâtel, Ecluse (FUNI)'),
  station('8530053', 'Neuchâtel, Plan (FUNI)'),
  station('8501008', 'Genève'),
  station('8774500', 'Lyon Part-Dieu'),
  station('8500010', 'Basel SBB'),
  station('8500023', 'Liestal'),
];

const ROUTES: RegionedRoute[] = [
  route('91-R-A-Y-j26-1', 'R', 'R', 'rhaetische-bahn', RHB),
  route('91-R-B-Y-j26-1', 'R', 'R', 'rhaetische-bahn', RHB),
  route('91-35-A-j26-1', 'IR', 'IR35', 'fernverkehr', SBB),
  route('91-3-A-j26-1', 'ICE', '3', 'fernverkehr', SBB),
  route('93-24-j26-1', 'FUN', '24', 'poly-bahn-zuerich', POLYBAHN),
  route('93-111-j26-1', 'FUN', '111', 'transports-publics-neuchatelois-sa', TPN),
  route('93-112-j26-1', 'FUN', '112', 'transports-publics-neuchatelois-sa', TPN),
  route('91-9-Y-j26-1', 'R', 'R', 'unbekannte-bahn-ag', UNKNOWN),
  route('91-ZZ-Y-j26-1', 'ZUG', 'ZUG', 'fernverkehr', SNCF),
  route('91-D8-Y-j26-1', 'S', 'S', 's-bahn-basel', SBB),
  route('91-3V-Y-j26-1', 'S', 'S', 's-bahn-aargau', SBB),
];

const PATTERNS: Pattern[] = [
  // Landquart to Davos Platz and back, and a short-turn to Klosters with three
  // times the trips that still does not name the line, being shorter. Its runs
  // are kept below the full pattern's so the merge keys both routes as one line.
  pattern('91-R-A-Y-j26-1', ['8509002', '8509065', '8509073'], 10, 600),
  pattern('91-R-A-Y-j26-1', ['8509002', '8509065'], 30),
  pattern('91-R-B-Y-j26-1', ['8509073', '8509065', '8509002']),
  pattern('91-35-A-j26-1', ['8503000', '8507000']),
  pattern('91-3-A-j26-1', ['8500010', '8503000']),
  pattern('93-24-j26-1', ['8503099', '8503098']),
  pattern('93-111-j26-1', ['8530050', '8530051']),
  pattern('93-112-j26-1', ['8530052', '8530053']),
  pattern('91-9-Y-j26-1', ['8509000', '8509002']),
  pattern('91-ZZ-Y-j26-1', ['8501008', '8774500']),
  pattern('91-D8-Y-j26-1', ['8500010', '8500023']),
  pattern('91-3V-Y-j26-1', ['8500010', '8500023']),
];

let logged: string[];

const log = (message: string): void => {
  logged.push(message);
};

beforeEach(() => {
  logged = [];
});

function input(routes = ROUTES, patterns = PATTERNS, stations = STATIONS): NamingInput {
  return {
    lines: mergeLines(routes, patterns, () => {}).lines,
    routes,
    patterns,
    stations,
    operators: OPERATORS,
  };
}

function nameOf(id: string): string | undefined {
  return nameLines(input(), log).lines.find(line => line.id === id)?.name;
}

describe('nameLines', () => {
  it('names an unnumbered line from operator, category and terminals, and marks it', () => {
    const { lines } = nameLines(input(), log);
    const rhb = lines.find(line => line.region === 'rhaetische-bahn');

    expect(rhb).toMatchObject({
      id: 'rhaetische-bahn:R:8509002-8509073',
      name: 'RhB R Davos Platz-Landquart',
      nameSource: 'derived',
      review: [],
    });
  });

  it('calls a numbered line by its number and leaves it unmarked', () => {
    const { lines } = nameLines(input(), log);

    expect(
      lines
        .filter(line => line.nameSource === 'number')
        .map(line => [line.id, line.name, line.review]),
    ).toEqual([
      ['fernverkehr:ICE-3', 'ICE 3', []],
      ['fernverkehr:IR35', 'IR35', []],
    ]);
  });

  it('names a funicular for its operator, whatever its BAV code', () => {
    expect(nameOf('poly-bahn-zuerich:FUN-24')).toBe('Standseilbahn Polybahn');
  });

  it('tells apart two funiculars of one operator by their terminals', () => {
    expect(nameOf('transports-publics-neuchatelois-sa:FUN-111')).toBe(
      'Standseilbahn transN Chaumont (FUNI)-Neuchâtel, La Coudre (FUNI)',
    );
    expect(nameOf('transports-publics-neuchatelois-sa:FUN-112')).toBe(
      'Standseilbahn transN Neuchâtel, Ecluse (FUNI)-Neuchâtel, Plan (FUNI)',
    );
    expect(logged[0]).toMatch(/2 funiculars told apart by their terminals/);
  });

  it('leaves the category out of a ZUG name', () => {
    expect(nameOf('fernverkehr:ZUG:8501008-8774500')).toBe('SNCF Genève-Lyon Part-Dieu');
  });

  it('falls back to the full name of an operator the table does not know, and flags it', () => {
    const { lines, fallbacks } = nameLines(input(), log);

    expect(lines.find(line => line.region === 'unbekannte-bahn-ag')).toMatchObject({
      name: 'Unbekannte Bahn AG R Chur-Landquart',
      review: ['unknown-operator'],
    });
    expect(fallbacks).toEqual([{ agencyId: '999', operator: 'Unbekannte Bahn AG', lines: 1 }]);
    expect(logged).toContain(
      'operator 999 Unbekannte Bahn AG has no short name, so 1 line carries its full name; add it to data/operators.json',
    );
  });

  it('flags two lines that come out with one name rather than renaming either', () => {
    const { lines } = nameLines(input(), log);
    const twins = lines.filter(line => line.name === 'SBB S Basel SBB-Liestal');

    expect(twins.map(line => [line.id, line.review])).toEqual([
      ['s-bahn-aargau:S:8500010-8500023', ['duplicate-name']],
      ['s-bahn-basel:S:8500010-8500023', ['duplicate-name']],
    ]);
    expect(logged).toContain(
      '2 lines are all named "SBB S Basel SBB-Liestal" — s-bahn-aargau:S:8500010-8500023, s-bahn-basel:S:8500010-8500023; they are different lines by id, and need telling apart by hand',
    );
  });

  it('reports an operator entry the feed spells differently', () => {
    const renamed = ROUTES.map(entry =>
      entry.agencyId === RHB.id ? { ...entry, operator: 'Rhaetische Bahn' } : entry,
    );

    nameLines(input(renamed), log);

    expect(logged).toContain(
      'operator 72 is Rhaetische Bahn in the feed, not Rhätische Bahn; fix data/operators.json',
    );
  });

  it('gives the same names and fingerprint on a second run and in any input order', () => {
    const first = nameLines(input(), log);
    const again = nameLines(input(), log);
    const reordered = nameLines(
      input([...ROUTES].reverse(), [...PATTERNS].reverse(), [...STATIONS].reverse()),
      log,
    );

    expect(again).toEqual(first);
    expect(reordered).toEqual(first);
    expect(JSON.stringify(reordered.lines)).toBe(JSON.stringify(first.lines));
    expect(first.fingerprint).toMatch(/^[0-9a-f]{16}$/);
  });
});
