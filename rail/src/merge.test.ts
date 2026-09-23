import { beforeEach, describe, expect, it } from 'vitest';

import type { Category } from './allowlist/categories.ts';
import { mergeLines } from './merge.ts';
import type { Pattern } from './patterns.ts';
import type { RegionedRoute } from './regions.ts';

/**
 * Values rather than a feed on disk: the step opens nothing, so its fixture is
 * what the regions and patterns steps would have handed it.
 *
 * The `IR35` is the case the step exists for — one line to ride, three
 * operators and both directions in the 2026 feed. The `S10` is the case the
 * issue named and the feed disagreed with: SZU's, SBB's and Thurbo's are the
 * Uetliberg, a TILO line and a St. Gallen line, three lines in three regions.
 * Around them: an `S5` whose two routes share no station, two unnumbered SBB
 * `IC`s on one corridor and one on another, and a TGV that never makes a Swiss
 * pattern.
 */
const BLS = 'BLS AG (bls)';
const SBB = 'Schweizerische Bundesbahnen SBB';
const SOB = 'Schweizerische Südostbahn (sob)';
const SZU = 'Sihltal-Zürich-Uetliberg-Bahn';
const THURBO = 'THURBO';

function route(
  routeId: string,
  category: Category,
  shortName: string | null,
  region: string,
  operator: string,
): RegionedRoute {
  return { routeId, agencyId: null, shortName, category, operator, region, source: 'rule' };
}

function pattern(routeId: string, stations: string[], runs = 300, trips = 10): Pattern {
  return { routeId, hash: stations.join('').slice(-16), stations, trips, runs };
}

const ROUTES: RegionedRoute[] = [
  route('91-35-A-j26-1', 'IR', 'IR35', 'fernverkehr', BLS),
  route('91-35-B-j26-1', 'IR', 'IR35', 'fernverkehr', SBB),
  route('91-35-C-j26-1', 'IR', ' IR35 ', 'fernverkehr', SOB),
  route('91-10-A-j26-1', 'S', 'S10', 's-bahn-zuerich', SZU),
  route('91-10-B-j26-1', 'S', 'S10', 'tilo', SBB),
  route('91-10-C-j26-1', 'S', 'S10', 's-bahn-st-gallen', THURBO),
  route('91-5-A-j26-1', 'S', 'S5', 's-bahn-zuerich', SBB),
  route('91-5-B-j26-1', 'S', 'S5', 's-bahn-zuerich', THURBO),
  route('91-2H-Y-j26-1', 'IC', 'IC', 'fernverkehr', SBB),
  route('91-19-Y-j26-1', 'IC', 'IC', 'fernverkehr', SBB),
  route('91-29-Y-j26-1', 'IC', null, 'fernverkehr', SBB),
  route('91-2N-Y-j26-1', 'TGV', 'TGV', 'fernverkehr', SBB),
];

const PATTERNS: Pattern[] = [
  pattern('91-35-A-j26-1', ['8507000', '8508005', '8509000']),
  pattern('91-35-A-j26-1', ['8509000', '8508005', '8507000']),
  pattern('91-35-B-j26-1', ['8507000', '8508005', '8505000']),
  pattern('91-35-C-j26-1', ['8505000', '8508005']),
  pattern('91-10-A-j26-1', ['8503000', '8503090']),
  pattern('91-10-B-j26-1', ['8505300', '8505213']),
  pattern('91-10-C-j26-1', ['8506302', '8506121']),
  pattern('91-5-A-j26-1', ['8503000', '8503016']),
  pattern('91-5-B-j26-1', ['8506000', '8506105']),
  // Zürich HB to Genève Aéroport one way, back the other, plus a short-turn that
  // is not the route's busiest pattern and so does not move its terminals.
  pattern('91-2H-Y-j26-1', ['8503000', '8507000', '8501008']),
  pattern('91-2H-Y-j26-1', ['8503000', '8507000'], 12, 2),
  pattern('91-19-Y-j26-1', ['8501008', '8507000', '8503000']),
  pattern('91-29-Y-j26-1', ['8503000', '8506302']),
];

let logged: string[];

const log = (message: string): void => {
  logged.push(message);
};

beforeEach(() => {
  logged = [];
});

function shuffled<T>(values: readonly T[]): T[] {
  return [...values.slice(3), ...values.slice(0, 3)].reverse();
}

describe('mergeLines', () => {
  it('merges every operator and direction of the IR35 into one line', () => {
    const { lines } = mergeLines(ROUTES, PATTERNS, log);
    const ir35 = lines.filter(line => line.number === 'IR35');

    expect(ir35).toEqual([
      {
        id: 'fernverkehr:IR35',
        category: 'IR',
        number: 'IR35',
        region: 'fernverkehr',
        terminals: null,
        operators: [BLS, SBB, SOB],
        routeIds: ['91-35-A-j26-1', '91-35-B-j26-1', '91-35-C-j26-1'],
        stations: ['8505000', '8507000', '8508005', '8509000'],
      },
    ]);
  });

  it('keeps one number in three regions as three lines', () => {
    const { lines } = mergeLines(ROUTES, PATTERNS, log);

    expect(
      lines.filter(line => line.number === 'S10').map(line => [line.id, line.operators]),
    ).toEqual([
      ['s-bahn-st-gallen:S10', [THURBO]],
      ['s-bahn-zuerich:S10', [SZU]],
      ['tilo:S10', [SBB]],
    ]);
  });

  it('merges routes that share no station, and reports them rather than hiding it', () => {
    const { lines, suspect } = mergeLines(ROUTES, PATTERNS, log);

    expect(lines.filter(line => line.number === 'S5').map(line => line.id)).toEqual([
      's-bahn-zuerich:S5',
    ]);
    expect(suspect).toEqual([
      {
        id: 's-bahn-zuerich:S5',
        parts: [
          { routeIds: ['91-5-A-j26-1'], operators: [SBB], terminals: ['8503000', '8503016'] },
          {
            routeIds: ['91-5-B-j26-1'],
            operators: [THURBO],
            terminals: ['8506000', '8506105'],
          },
        ],
      },
    ]);
    expect(logged).toContain(
      `line s-bahn-zuerich:S5 merges 2 groups of routes that share no station — 91-5-A-j26-1 by ${SBB}, 8503000–8503016 | 91-5-B-j26-1 by ${THURBO}, 8506000–8506105; if they are different lines, add a rule to data/regions.json`,
    );
  });

  it('keys a line without a number on its terminals, in both directions', () => {
    const { lines } = mergeLines(ROUTES, PATTERNS, log);
    const ic = lines.filter(line => line.category === 'IC');

    expect(ic.map(line => [line.id, line.number, line.terminals, line.routeIds])).toEqual([
      [
        'fernverkehr:IC:8501008-8503000',
        null,
        ['8501008', '8503000'],
        ['91-19-Y-j26-1', '91-2H-Y-j26-1'],
      ],
      ['fernverkehr:IC:8503000-8506302', null, ['8503000', '8506302'], ['91-29-Y-j26-1']],
    ]);
  });

  it('leaves out a route that made no pattern, and counts it', () => {
    const { lines, dropped } = mergeLines(ROUTES, PATTERNS, log);

    expect(lines.some(line => line.category === 'TGV')).toBe(false);
    expect(dropped).toBe(1);
    expect(logged).toContain('1 route without a stop pattern left out of the lines');
  });

  it('never puts a route_id into an id', () => {
    const { lines } = mergeLines(ROUTES, PATTERNS, log);

    for (const line of lines) {
      for (const routeId of line.routeIds) {
        expect(line.id).not.toContain(routeId);
      }
    }
  });

  it('gives the same lines and fingerprint whatever order the routes arrive in', () => {
    const first = mergeLines(ROUTES, PATTERNS, log);
    const again = mergeLines(ROUTES, PATTERNS, log);
    const reordered = mergeLines(shuffled(ROUTES), shuffled(PATTERNS), log);

    expect(again).toEqual(first);
    expect(reordered).toEqual(first);
    expect(JSON.stringify(reordered.lines)).toBe(JSON.stringify(first.lines));
    expect(first.fingerprint).toMatch(/^[0-9a-f]{16}$/);
  });

  it('names the lines run by more than one operator', () => {
    mergeLines(ROUTES, PATTERNS, log);

    expect(logged).toContain(
      `2 lines run by more than one operator; most: fernverkehr:IR35 (${BLS}, ${SBB}, ${SOB}); s-bahn-zuerich:S5 (${SBB}, ${THURBO})`,
    );
  });

  it('keeps one bare number in two categories as two lines', () => {
    const routes = [
      route('a', 'ICE', '3', 'fernverkehr', SBB),
      route('b', 'NJ', '3', 'fernverkehr', SBB),
    ];
    const patterns = [pattern('a', ['1', '2']), pattern('b', ['1', '2'])];

    expect(mergeLines(routes, patterns, log).lines.map(line => line.id)).toEqual([
      'fernverkehr:ICE-3',
      'fernverkehr:NJ-3',
    ]);
  });

  it('stops when two categories would still share one id', () => {
    const routes = [
      route('a', 'S', 'SN1', 'jura', SBB),
      route('b', 'SN', 'SN1', 'jura', SBB),
    ];
    const patterns = [pattern('a', ['1', '2']), pattern('b', ['1', '2'])];

    expect(() => mergeLines(routes, patterns, log)).toThrow(
      /jura:SN1 stands for S and SN/,
    );
  });

  it('stops on a line number that cannot go into an id', () => {
    const routes = [route('a', 'S', 'S1:2', 'jura', SBB)];

    expect(() => mergeLines(routes, [pattern('a', ['1', '2'])], log)).toThrow(
      /route a by Schweizerische Bundesbahnen SBB has line number "S1:2"/,
    );
  });

  it('stops when no route made a pattern', () => {
    expect(() => mergeLines(ROUTES, [], log)).toThrow(/none of 12 routes made a stop pattern/);
  });
});
