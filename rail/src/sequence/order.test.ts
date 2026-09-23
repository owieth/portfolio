import { describe, expect, it } from 'vitest';

import type { Pattern } from '../patterns.ts';
import { backbone, canonicalSequence, firstVisits, poolPatterns } from './order.ts';
import type { PooledPattern, Sequence } from './order.ts';

/**
 * The IC1 is the line the issue names: Genève-Aéroport to St. Gallen, both ways,
 * with trains that start at Genève instead. The S12 is the branch the patterns
 * step's README uses: Brugg to Winterthur, then on to either Wil or
 * Schaffhausen. The rest are single letters' worth of Didok numbers, in the
 * order the stations lie, so a sequence can be read off at a glance.
 */
const GENEVE_AEROPORT = '8501026';
const GENEVE = '8501008';
const LAUSANNE = '8501120';
const FRIBOURG = '8504100';
const BERN = '8507000';
const ZUERICH = '8503000';
const ZUERICH_FLUGHAFEN = '8503016';
const WINTERTHUR = '8506000';
const ST_GALLEN = '8506302';

const BRUGG = '8500309';
const BADEN = '8503504';
const OBERWINTERTHUR = '8506016';
const ELGG = '8506102';
const WIL = '8506109';
const HETTLINGEN = '8506011';
const SCHAFFHAUSEN = '8503424';

const [A, B, C, D, E] = ['8500001', '8500002', '8500003', '8500004', '8500005'];
const [P, Q, X, Z] = ['8500101', '8500102', '8500103', '8500104'];

const IC1 = [
  GENEVE_AEROPORT,
  GENEVE,
  LAUSANNE,
  FRIBOURG,
  BERN,
  ZUERICH,
  ZUERICH_FLUGHAFEN,
  WINTERTHUR,
  ST_GALLEN,
];

function pooled(stations: string[], runs = 300, trips = 10): PooledPattern {
  return { hash: stations.join('-'), stations, trips, runs };
}

function reversed(stations: readonly string[]): string[] {
  return [...stations].reverse();
}

function didoks(sequence: Sequence): string[] {
  return sequence.stops.map(stop => stop.didok);
}

/** Nothing a pattern serves may go missing, and nothing may appear twice. */
function expectComplete(sequence: Sequence, pool: readonly PooledPattern[]): void {
  const served = new Set(pool.flatMap(pattern => pattern.stations));

  expect(new Set(didoks(sequence))).toEqual(served);
  expect(sequence.stops).toHaveLength(served.size);
}

describe('poolPatterns', () => {
  it('pools one stop list run by two routes into one pattern with both counts', () => {
    const patterns: Pattern[] = [
      { routeId: 'a', hash: 'h1', stations: [A, B], trips: 4, runs: 100 },
      { routeId: 'b', hash: 'h1', stations: [A, B], trips: 2, runs: 50 },
      { routeId: 'b', hash: 'h2', stations: [B, A], trips: 6, runs: 200 },
    ];

    expect(poolPatterns(patterns)).toEqual([
      { hash: 'h2', stations: [B, A], trips: 6, runs: 200 },
      { hash: 'h1', stations: [A, B], trips: 6, runs: 150 },
    ]);
  });
});

describe('backbone', () => {
  it('prefers the longest pattern over a busier short-turn', () => {
    const full = pooled([A, B, C, D], 10);
    const short = pooled([A, B, C], 900);

    expect(backbone([short, full])).toBe(full);
  });

  it('breaks a tie in length by what runs most', () => {
    const busy = pooled([D, C, B, A], 300);
    const quiet = pooled([A, B, C, D], 100);

    expect(backbone([quiet, busy])).toBe(busy);
  });
});

describe('firstVisits', () => {
  it('keeps the first visit of a station the pattern comes back to', () => {
    expect(firstVisits([A, B, C, B])).toEqual({ stations: [A, B, C], loop: true });
    expect(firstVisits([A, B])).toEqual({ stations: [A, B], loop: false });
  });
});

describe('canonicalSequence', () => {
  it('runs the IC1 from Genève-Aéroport to St. Gallen, whichever way its busiest trains go', () => {
    const pool = [
      pooled(reversed(IC1), 400),
      pooled(IC1, 390),
      pooled(reversed(IC1.slice(1)), 20),
      pooled(IC1.slice(1), 19),
    ];
    const sequence = canonicalSequence(pool);

    expect(didoks(sequence)).toEqual(IC1);
    expect(sequence.stops.every(stop => stop.via === 'backbone' && stop.junction === null)).toBe(
      true,
    );
    expect(sequence.patterns.map(pattern => [pattern.stations[0], pattern.reversed])).toEqual([
      [ST_GALLEN, true],
      [GENEVE_AEROPORT, false],
      [ST_GALLEN, true],
      [GENEVE, false],
    ]);
    expect(sequence.conflicts).toEqual([]);
  });

  it('keeps both of the S12’s branches, the second as a block after the trunk from Winterthur', () => {
    const trunk = [BRUGG, BADEN, ZUERICH, WINTERTHUR];
    const toWil = [...trunk, OBERWINTERTHUR, ELGG, WIL];
    const toSchaffhausen = [...trunk, HETTLINGEN, SCHAFFHAUSEN];
    const pool = [
      pooled([SCHAFFHAUSEN, HETTLINGEN, WINTERTHUR], 500),
      pooled(toWil, 300),
      pooled(reversed(toWil), 300),
      pooled(toSchaffhausen, 200),
      pooled(reversed(toSchaffhausen), 200),
    ];
    const sequence = canonicalSequence(pool);

    expect(sequence.stops).toEqual([
      ...toWil.map(didok => ({ didok, via: 'backbone', junction: null })),
      { didok: HETTLINGEN, via: 'branch', junction: WINTERTHUR },
      { didok: SCHAFFHAUSEN, via: 'branch', junction: WINTERTHUR },
    ]);
    expect(
      sequence.patterns.find(pattern => pattern.stations[0] === SCHAFFHAUSEN && pattern.runs === 500)
        ?.reversed,
    ).toBe(true);
    expectComplete(sequence, pool);
  });

  it('places a branch that rejoins just before the stop it rejoins at', () => {
    const pool = [pooled([A, B, C, D], 300), pooled([A, P, Q, D], 100)];
    const sequence = canonicalSequence(pool);

    expect(sequence.stops).toEqual([
      { didok: A, via: 'backbone', junction: null },
      { didok: B, via: 'backbone', junction: null },
      { didok: C, via: 'backbone', junction: null },
      { didok: P, via: 'detour', junction: A },
      { didok: Q, via: 'detour', junction: A },
      { didok: D, via: 'backbone', junction: null },
    ]);
  });

  it('puts a stop only a short-turn serves between the two stops either side of it', () => {
    const pool = [pooled([A, B, C, D, E], 300), pooled([E, C, X, B], 40)];
    const sequence = canonicalSequence(pool);

    expect(didoks(sequence)).toEqual([A, B, X, C, D, E]);
    expect(sequence.stops[2]).toEqual({ didok: X, via: 'detour', junction: B });
    expect(sequence.patterns[1]?.reversed).toBe(true);
  });

  it('places a detour past skipped stops in the gap where it adds the least distance', () => {
    const [ARTH_GOLDAU, FLUELEN, ALTDORF, BIASCA, BELLINZONA] = [
      '8505004',
      '8505110',
      '8505112',
      '8505213',
      '8505300',
    ];
    const positions = new Map([
      [ARTH_GOLDAU, { lat: 47.0493, lon: 8.548 }],
      [FLUELEN, { lat: 46.902, lon: 8.624 }],
      [ALTDORF, { lat: 46.877, lon: 8.638 }],
      [BIASCA, { lat: 46.359, lon: 8.97 }],
      [BELLINZONA, { lat: 46.195, lon: 9.029 }],
    ]);
    const pool = [
      pooled([ARTH_GOLDAU, ALTDORF, BIASCA, BELLINZONA], 300),
      pooled([ARTH_GOLDAU, FLUELEN, BELLINZONA], 100),
    ];

    expect(didoks(canonicalSequence(pool, positions))).toEqual([
      ARTH_GOLDAU,
      FLUELEN,
      ALTDORF,
      BIASCA,
      BELLINZONA,
    ]);
    // Without coordinates it goes just before the stop it rejoins at.
    expect(didoks(canonicalSequence(pool))).toEqual([
      ARTH_GOLDAU,
      ALTDORF,
      BIASCA,
      FLUELEN,
      BELLINZONA,
    ]);
  });

  it('hangs a short-turn’s terminus off the line as a branch from where it leaves', () => {
    const pool = [pooled([A, B, C, D], 300), pooled([A, B, Z], 40)];
    const sequence = canonicalSequence(pool);

    expect(sequence.stops.at(-1)).toEqual({ didok: Z, via: 'branch', junction: B });
    expect(didoks(sequence)).toEqual([A, B, C, D, Z]);
  });

  it('extends the trunk at either end, even from a pattern that shares only the end', () => {
    const pool = [pooled([B, C, D], 300), pooled([B, A], 50), pooled([E, D], 50)];
    const sequence = canonicalSequence(pool);

    expect(sequence.stops).toEqual([
      { didok: A, via: 'extension', junction: B },
      { didok: B, via: 'backbone', junction: null },
      { didok: C, via: 'backbone', junction: null },
      { didok: D, via: 'backbone', junction: null },
      { didok: E, via: 'extension', junction: D },
    ]);
  });

  it('keeps the busier order when two patterns disagree, and records the other', () => {
    const disagreeing = pooled([A, C, X, B], 10);
    const pool = [pooled([A, B, C, D, E], 300), disagreeing];
    const sequence = canonicalSequence(pool);

    expect(didoks(sequence)).toEqual([A, B, C, D, E, X]);
    expect(sequence.stops.at(-1)).toEqual({ didok: X, via: 'branch', junction: C });
    expect(sequence.conflicts).toEqual([disagreeing.hash]);
  });

  it('does not call a pattern that comes in off a branch through its junction a conflict', () => {
    // The IC1's Romont FR starts: Romont to St. Gallen, then one that stops at Zürich.
    const pool = [pooled([A, B, C, D], 300), pooled([Z, B, C, D], 200), pooled([Z, B, C], 1)];
    const sequence = canonicalSequence(pool);

    expect(sequence.stops.at(-1)).toEqual({ didok: Z, via: 'branch', junction: B });
    expect(sequence.conflicts).toEqual([]);
  });

  it('keeps the first visit of a station a pattern loops back to', () => {
    const pool = [pooled([A, B, C, D], 300), pooled([A, B, C, B, A], 20)];
    const sequence = canonicalSequence(pool);

    expect(didoks(sequence)).toEqual([A, B, C, D]);
    expect(sequence.loop).toBe(true);
    expect(sequence.conflicts).toEqual([]);
  });

  it('lists a pattern that shares no stop with the rest as a block of its own', () => {
    const pool = [pooled([A, B, C], 300), pooled([Q, P], 20)];
    const sequence = canonicalSequence(pool);

    expect(sequence.stops.slice(3)).toEqual([
      { didok: P, via: 'branch', junction: null },
      { didok: Q, via: 'branch', junction: null },
    ]);
  });

  it('gives the same sequence whatever order the patterns arrive in', () => {
    const pool = [
      pooled([A, B, C, D], 300),
      pooled([D, C, B, A], 300),
      pooled([A, P, D], 40),
      pooled([B, Z], 40),
      pooled([E, D], 10),
    ];
    const first = canonicalSequence(pool);

    expect(canonicalSequence([...pool].reverse())).toEqual(first);
    expect(canonicalSequence([...pool.slice(2), ...pool.slice(0, 2)])).toEqual(first);
    expectComplete(first, pool);
  });

  it('has nothing to say about no patterns', () => {
    expect(canonicalSequence([])).toEqual({ stops: [], patterns: [], conflicts: [], loop: false });
  });
});
