/**
 * The commute, as the table that turns an office day into rides.
 *
 * Everything here is recollection rather than record. The calendar says which
 * days I went to the office and where to; it says nothing about which train I
 * took, and no timetable can answer that for a past date — opentransportdata
 * serves the current timetable only. So the lines come from me, as ratios: nine
 * Bern-Zürich legs out of ten were the IC1, thirty of the Zürich-Zug legs were
 * the S24, ten of the two hundred returns came back through Luzern.
 *
 * A ratio has to become particular rows, and this module is where that invented
 * precision is contained. `allocate` turns a ratio into exact counts for a pool
 * of legs, `spread` deals those counts out across the pool in date order, and
 * both are deterministic, so the same export produces the same seed forever.
 * The totals per line are what I actually claim; which line any single date
 * carries is an artefact of the spread. The generated SQL says so.
 *
 * Pools are per leg, not per day and not per direction: every Zürich-Zug leg in
 * the whole history, outbound and back, is dealt from one pool of 390. Splitting
 * the pool per direction would round twice and drift the totals for no gain.
 */

/** The day I moved from Unterzollikofen to Luzern. Before it, leg one is the S9. */
export const MOVED_ON = '2026-06-23';

/** How many of the pre-move Zug days came home through Luzern instead of Zürich. */
export const RETURNS_VIA_LUZERN = 10;

const DIDOK = {
  unterzollikofen: '8508055',
  bern: '8507000',
  olten: '8500218',
  zofingen: '8502001',
  zurich: '8503000',
  zug: '8502204',
  luzern: '8505000',
  wildegg: '8502115',
} as const;

const LINE = {
  s9: 's-bahn-bern:S9',
  ic1: 'fernverkehr:IC1',
  ic8: 'fernverkehr:IC8',
  ir75: 'fernverkehr:IR75',
  ir70: 'fernverkehr:IR70',
  ec: 'fernverkehr:EC:8503000-8505307',
  s24: 's-bahn-zuerich:S24',
  ir15: 'fernverkehr:IR15',
  ice: 'fernverkehr:ICE:8500090-8507492',
  ic6: 'fernverkehr:IC6',
  re12: 's-bahn-zuerich:RE12',
  ic21: 'fernverkehr:IC21',
  s29: 's-bahn-aargau:S29',
} as const;

/**
 * Where an office day went, from the event's `LOCATION`. Wildegg is the station
 * for a coworker's place in Möriken, which counts as an office day.
 */
export type Destination = 'zug' | 'zurich' | 'wildegg' | 'luzern';

/**
 * Matched against the first line of `LOCATION`, longest prefix first. A location
 * that matches nothing is an error rather than a skipped day: a new office or a
 * mistyped event should stop the seed, not quietly shrink it.
 */
const DESTINATIONS: [prefix: string, destination: Destination][] = [
  ['Zug', 'zug'],
  ['Zurich', 'zurich'],
  ['Zürich', 'zurich'],
  ['Plattenstrasse', 'zurich'],
  ['Bremgartnerstrasse', 'zurich'],
  ['Möriken-Wildegg', 'wildegg'],
  ['Sandacker', 'wildegg'],
  ['Lucerne', 'luzern'],
  ['Luzern', 'luzern'],
];

export function classify(location: string): Destination | undefined {
  const place = location.split('\n')[0].trim();

  return DESTINATIONS.find(([prefix]) => place.startsWith(prefix))?.[1];
}

/** A leg of one journey: a stretch to ride, and the pool that picks its line. */
export interface Leg {
  from: string;
  to: string;
  pool: PoolName;
}

type PoolName = keyof typeof POOLS;

/**
 * How each pool's legs divide between lines. `count` is an absolute number of
 * legs taken off the top; `share` divides whatever is left. A pool of one line
 * needs neither.
 */
export const POOLS = {
  s9: [{ line: LINE.s9 }],
  bernZurich: [
    { line: LINE.ic1, share: 0.9 },
    { line: LINE.ic8, share: 0.1 },
  ],
  zurichZug: [
    { line: LINE.s24, count: 30 },
    { line: LINE.ir75, share: 0.7 },
    { line: LINE.ir70, share: 0.05 },
    { line: LINE.ec, share: 0.25 },
  ],
  bernOlten: [
    { line: LINE.ice, share: 0.5 },
    { line: LINE.ic6, share: 0.5 },
  ],
  oltenWildegg: [{ line: LINE.re12 }],
  bernLuzern: [{ line: LINE.ir15 }],
  zugLuzern: [{ line: LINE.ir70 }],
  luzernZug: [{ line: LINE.ir70 }],
  luzernOlten: [{ line: LINE.ic21 }],
  wildeggS29: [{ line: LINE.s29 }],
  zofingenLuzern: [{ line: LINE.ir15 }],
} satisfies Record<string, { line: string; share?: number; count?: number }[]>;

const S9_OUT: Leg = { from: DIDOK.unterzollikofen, to: DIDOK.bern, pool: 's9' };
const S9_BACK: Leg = { from: DIDOK.bern, to: DIDOK.unterzollikofen, pool: 's9' };
const BERN_ZURICH: Leg = { from: DIDOK.bern, to: DIDOK.zurich, pool: 'bernZurich' };
const ZURICH_BERN: Leg = { from: DIDOK.zurich, to: DIDOK.bern, pool: 'bernZurich' };
const ZURICH_ZUG: Leg = { from: DIDOK.zurich, to: DIDOK.zug, pool: 'zurichZug' };
const ZUG_ZURICH: Leg = { from: DIDOK.zug, to: DIDOK.zurich, pool: 'zurichZug' };

/** The three pre-move Zug legs, out and back the same way. */
const ZUG_VIA_ZURICH = {
  out: [S9_OUT, BERN_ZURICH, ZURICH_ZUG],
  back: [ZUG_ZURICH, ZURICH_BERN, S9_BACK],
};

/** Ten of the two hundred pre-move Zug days came home the long way. */
export const ZUG_BACK_VIA_LUZERN: Leg[] = [
  { from: DIDOK.zug, to: DIDOK.luzern, pool: 'zugLuzern' },
  { from: DIDOK.luzern, to: DIDOK.bern, pool: 'bernLuzern' },
  S9_BACK,
];

export type RouteKey =
  | 'pre:zug'
  | 'pre:zurich'
  | 'pre:luzern'
  | 'pre:wildegg'
  | 'post:zug'
  | 'post:wildegg';

export const ROUTES: Record<RouteKey, { out: Leg[]; back: Leg[] }> = {
  'pre:zug': ZUG_VIA_ZURICH,
  'pre:zurich': { out: [S9_OUT, BERN_ZURICH], back: [ZURICH_BERN, S9_BACK] },
  'pre:luzern': {
    out: [S9_OUT, { from: DIDOK.bern, to: DIDOK.luzern, pool: 'bernLuzern' }],
    back: [{ from: DIDOK.luzern, to: DIDOK.bern, pool: 'bernLuzern' }, S9_BACK],
  },
  'pre:wildegg': {
    out: [
      S9_OUT,
      { from: DIDOK.bern, to: DIDOK.olten, pool: 'bernOlten' },
      { from: DIDOK.olten, to: DIDOK.wildegg, pool: 'oltenWildegg' },
    ],
    back: [
      { from: DIDOK.wildegg, to: DIDOK.olten, pool: 'oltenWildegg' },
      { from: DIDOK.olten, to: DIDOK.bern, pool: 'bernOlten' },
      S9_BACK,
    ],
  },
  'post:zug': {
    out: [{ from: DIDOK.luzern, to: DIDOK.zug, pool: 'luzernZug' }],
    back: [{ from: DIDOK.zug, to: DIDOK.luzern, pool: 'luzernZug' }],
  },
  // The one asymmetric journey: out over Olten, home over Zofingen.
  'post:wildegg': {
    out: [
      { from: DIDOK.luzern, to: DIDOK.olten, pool: 'luzernOlten' },
      { from: DIDOK.olten, to: DIDOK.wildegg, pool: 'wildeggS29' },
    ],
    back: [
      { from: DIDOK.wildegg, to: DIDOK.zofingen, pool: 'wildeggS29' },
      { from: DIDOK.zofingen, to: DIDOK.luzern, pool: 'zofingenLuzern' },
    ],
  },
};

/** A line and the number of legs it takes, as `allocate` divides a pool up. */
export interface Allocation {
  key: string;
  count: number;
}

/** How many legs of a pool each line gets, exactly summing to `total`. */
export function allocate(
  choices: { line: string; share?: number; count?: number }[],
  total: number,
): Allocation[] {
  const fixed = choices.reduce((sum, choice) => sum + (choice.count ?? 0), 0);

  if (fixed > total) {
    throw new Error(`pool of ${total} legs cannot hold ${fixed} fixed ones`);
  }

  const rest = total - fixed;
  const shared = choices.filter(choice => choice.count === undefined);
  const exact = shared.map(choice => (choice.share ?? 1) * rest);
  const counts = exact.map(Math.floor);

  // Largest remainder, so the counts sum to the pool rather than to the sum of
  // the rounded shares. Ties go to the earlier line, which is declaration order.
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  for (let i = 0; i < rest - counts.reduce((sum, count) => sum + count, 0); i += 1) {
    counts[order[i % order.length].index] += 1;
  }

  let next = 0;

  return choices.map(choice =>
    choice.count === undefined
      ? { key: choice.line, count: counts[next++] }
      : { key: choice.line, count: choice.count },
  );
}

/**
 * Deal `counts` out over `total` positions so each line is spread through the
 * run rather than blocked at the front of it. Every position credits each line
 * its share and hands the slot to whoever is owed most, which interleaves a
 * 70/25/5 split as evenly as integers allow.
 */
export function spread(counts: Allocation[], total: number): string[] {
  const state = counts.map(({ key, count }) => ({ key, count, used: 0, credit: 0 }));
  const dealt: string[] = [];

  for (let slot = 0; slot < total; slot += 1) {
    let best: (typeof state)[number] | undefined;

    for (const entry of state) {
      entry.credit += entry.count / total;

      if (entry.used < entry.count && (!best || entry.credit > best.credit)) best = entry;
    }

    if (!best) throw new Error(`counts sum to fewer than ${total} legs`);

    best.credit -= 1;
    best.used += 1;
    dealt.push(best.key);
  }

  return dealt;
}
