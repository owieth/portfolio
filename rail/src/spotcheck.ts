/**
 * The lines that prove the pipeline right, checked on every build and in CI.
 *
 * Each case is one a broken step would get wrong in a way no count would show:
 * the `IC1` loses a terminal when the termini or sequence step regresses, the
 * Zürich `S10` splits when the merge keys on operator, the two Rigi lines fuse
 * when it keys on operator alone, and a cableway or a bus arrives the day the
 * allowlist stops reading `route_desc`. A new feed that changes one of these
 * fails the build here, by name, before anything is written.
 *
 * The expectations are the 2026 feed's facts, not rules. When a December feed
 * changes one for real — a terminus moves, a line is renumbered — edit the case
 * after reading the diff, the same way `REPORT.md` is read before a commit.
 */

import { CATEGORIES, EXCLUDED } from './allowlist/categories.ts';
import type { Category, ExcludedCode } from './allowlist/categories.ts';
import type { LineRecord } from './emit/rows.ts';

export interface SpotCheck {
  /** The line as a reader would name it, first in every failure. */
  line: string;
  /** What has to hold, read as "expected …". */
  expectation: string;
  /** What was found instead, or `null` when the expectation holds. */
  check: (lines: readonly LineRecord[]) => string | null;
}

interface ExpectedLine {
  id: string;
  displayName: string;
  category: Category;
  /** In either order: the naming step sorts them, and a check should not care. */
  terminals: readonly [string, string];
  operator?: string;
  seasonal?: boolean;
}

/**
 * A feed line alongside the Vitznau line, over the same nine stops, with 15
 * trips a week numbered `SKI-…`: the winter service to Rigi Kaltbad-First. It
 * is a line of its own because the feed gives it a number of its own, and it is
 * allowed here so that the Rigi check still fails on anything else.
 */
const KNOWN_RIGI_EXTRAS: ReadonlySet<string> = new Set(['rigi-bahnen-ag:CC-88']);

const RIGI_BAHNEN = 'rigi-bahnen-ag';
const VITZNAU = '8508464';
const ARTH_GOLDAU_RB = '8505063';
const PILATUS_KULM = '8508456';

/**
 * The stations only the Rigi's aerial cableways serve: Weggis–Rigi Kaltbad,
 * Kräbel–Rigi Scheidegg and Obergschwend–Burggeist. A line stopping at one is
 * a cableway that got past the allowlist, whatever category it claims.
 */
const RIGI_CABLEWAY_STOPS: ReadonlyMap<string, string> = new Map([
  ['8530388', 'Weggis (Luftseilbahn)'],
  ['8530687', 'Rigi Kaltbad (Luftseilbahn)'],
  ['8530683', 'Kräbel (Talstation Scheidegg)'],
  ['8505078', 'Rigi Scheidegg'],
  ['8530798', 'Burggeist (Rigi Scheidegg)'],
]);

/** The gondola from Kriens and the Dragon Ride on to Pilatus Kulm. */
const PILATUS_GONDOLA_STOPS: ReadonlyMap<string, string> = new Map([
  ['8508454', 'Krienseregg'],
  ['8508455', 'Fräkmüntegg'],
]);

function runs(record: LineRecord): string {
  return `${record.terminal_a} to ${record.terminal_b}`;
}

function sameTerminals(record: LineRecord, [a, b]: readonly [string, string]): boolean {
  return (
    (record.terminal_a === a && record.terminal_b === b) ||
    (record.terminal_a === b && record.terminal_b === a)
  );
}

function serves(record: LineRecord, didok: string): boolean {
  return record.stops.some(stop => stop.didok === didok);
}

function list(items: readonly string[]): string {
  return items.length > 5
    ? `${items.slice(0, 5).join(', ')} and ${items.length - 5} more`
    : items.join(', ');
}

function mismatches(record: LineRecord, expected: ExpectedLine): string[] {
  const found: string[] = [];

  if (record.display_name !== expected.displayName) {
    found.push(`is named ${record.display_name}`);
  }

  if (record.category !== expected.category) {
    found.push(`is category ${record.category}`);
  }

  if (!sameTerminals(record, expected.terminals)) {
    found.push(`runs ${runs(record)}`);
  }

  if (expected.operator !== undefined && !record.operators.includes(expected.operator)) {
    found.push(`is operated by ${record.operators.join(' and ')}`);
  }

  if (expected.seasonal !== undefined && record.seasonal !== expected.seasonal) {
    found.push(`has seasonal ${record.seasonal}`);
  }

  return found;
}

function expectLine(expected: ExpectedLine): SpotCheck['check'] {
  return lines => {
    const record = lines.find(line => line.id === expected.id);

    if (record === undefined) {
      return `there is no line ${expected.id}`;
    }

    const found = mismatches(record, expected);

    return found.length === 0 ? null : `${expected.id} ${found.join(', ')}`;
  };
}

function expectAbsent(stops: ReadonlyMap<string, string>): SpotCheck['check'] {
  return lines => {
    const found = lines.flatMap(line =>
      line.stops
        .filter(stop => stop.didok !== null && stops.has(stop.didok))
        .map(stop => `${line.id} stops at ${stop.stop_name}`),
    );

    return found.length === 0 ? null : list(found);
  };
}

const ZURICH_S10: ExpectedLine = {
  id: 's-bahn-zuerich:S10',
  displayName: 'S10',
  category: 'S',
  terminals: ['Zürich HB', 'Uetliberg'],
  operator: 'Sihltal-Zürich-Uetliberg-Bahn',
};

export const SPOT_CHECKS: readonly SpotCheck[] = [
  {
    line: 'IC1',
    expectation: 'fernverkehr:IC1 from Genève-Aéroport to St. Gallen',
    check: expectLine({
      id: 'fernverkehr:IC1',
      displayName: 'IC1',
      category: 'IC',
      terminals: ['Genève-Aéroport', 'St. Gallen'],
    }),
  },
  {
    line: 'IR15',
    expectation: 'fernverkehr:IR15 from Genève-Aéroport to Luzern',
    check: expectLine({
      id: 'fernverkehr:IR15',
      displayName: 'IR15',
      category: 'IR',
      terminals: ['Genève-Aéroport', 'Luzern'],
    }),
  },
  {
    line: 'S10 (Uetlibergbahn)',
    expectation: 'one line, s-bahn-zuerich:S10 from Zürich HB to Uetliberg, run by SZU',
    check: lines => {
      const s10s = lines.filter(
        line => line.network_region === 's-bahn-zuerich' && line.display_name === 'S10',
      );

      return s10s.length > 1
        ? `there are ${s10s.length}: ${list(s10s.map(line => line.id))}`
        : expectLine(ZURICH_S10)(lines);
    },
  },
  {
    line: 'S10 (Ticino and St. Gallen)',
    expectation: 'tilo:S10 and s-bahn-st-gallen:S10 to stay lines of their own',
    check: lines => {
      const missing = ['tilo:S10', 's-bahn-st-gallen:S10'].filter(
        id => !lines.some(line => line.id === id),
      );

      return missing.length === 0 ? null : `there is no line ${missing.join(' or ')}`;
    },
  },
  {
    line: 'Rigi (Arth-Goldau)',
    expectation: 'rigi-bahnen-ag:CC-81 from Arth-Goldau RB to Rigi Kulm',
    check: expectLine({
      id: 'rigi-bahnen-ag:CC-81',
      displayName: 'CC 81',
      category: 'CC',
      terminals: ['Arth-Goldau RB', 'Rigi Kulm'],
    }),
  },
  {
    line: 'Rigi (Vitznau)',
    expectation: 'rigi-bahnen-ag:CC-82 from Vitznau to Rigi Kulm',
    check: expectLine({
      id: 'rigi-bahnen-ag:CC-82',
      displayName: 'CC 82',
      category: 'CC',
      terminals: ['Vitznau', 'Rigi Kulm'],
    }),
  },
  {
    line: 'Rigi rack railways',
    expectation: `two lines, not one, and no other Rigi Bahnen line than ${[...KNOWN_RIGI_EXTRAS].join(', ')}`,
    check: lines => {
      const fused = lines.filter(line => serves(line, VITZNAU) && serves(line, ARTH_GOLDAU_RB));

      if (fused.length > 0) {
        return `${list(fused.map(line => line.id))} stops at both Vitznau and Arth-Goldau RB`;
      }

      const expected = new Set(['rigi-bahnen-ag:CC-81', 'rigi-bahnen-ag:CC-82', ...KNOWN_RIGI_EXTRAS]);
      const others = lines.filter(
        line => line.network_region === RIGI_BAHNEN && !expected.has(line.id),
      );

      return others.length === 0 ? null : `there is also ${list(others.map(line => line.id))}`;
    },
  },
  {
    line: 'Rigi aerial cableways',
    expectation: 'no line to stop where only a Rigi cableway does',
    check: expectAbsent(RIGI_CABLEWAY_STOPS),
  },
  {
    line: 'Pilatus rack railway',
    expectation: 'pilatusbahnen:CC-R83 from Alpnachstad PB to Pilatus Kulm, seasonal',
    check: expectLine({
      id: 'pilatusbahnen:CC-R83',
      displayName: 'CC R83',
      category: 'CC',
      terminals: ['Alpnachstad PB', 'Pilatus Kulm'],
      seasonal: true,
    }),
  },
  {
    line: 'Pilatus gondola',
    expectation: 'no line to Krienseregg or Fräkmüntegg, and only the rack railway at Pilatus Kulm',
    check: lines => {
      const gondola = expectAbsent(PILATUS_GONDOLA_STOPS)(lines);

      if (gondola !== null) {
        return gondola;
      }

      const others = lines.filter(
        line => line.id !== 'pilatusbahnen:CC-R83' && serves(line, PILATUS_KULM),
      );

      return others.length === 0
        ? null
        : `${list(others.map(line => line.id))} stops at Pilatus Kulm`;
    },
  },
  {
    line: 'Polybahn',
    expectation: 'poly-bahn-zuerich:FUN-24 from Zürich Central (Polybahn) to Zürich Polyterrasse',
    check: expectLine({
      id: 'poly-bahn-zuerich:FUN-24',
      displayName: 'Standseilbahn Polybahn',
      category: 'FUN',
      terminals: ['Zürich Central (Polybahn)', 'Zürich Polyterrasse'],
    }),
  },
  {
    line: 'Every line',
    expectation: 'a train, rack railway or funicular — no bus, tram, metro, boat or cable car',
    check: lines => {
      const found = lines
        .filter(line => !Object.hasOwn(CATEGORIES, line.category))
        .map(line => {
          const category: string = line.category;
          const reason = Object.hasOwn(EXCLUDED, category)
            ? EXCLUDED[category as ExcludedCode].reason
            : 'not a category the allowlist includes';

          return `${line.id} is ${category} (${reason})`;
        });

      return found.length === 0 ? null : list(found);
    },
  },
];

/** One sentence per failed check, each naming the line and the expectation. */
export function spotCheck(lines: readonly LineRecord[]): string[] {
  return SPOT_CHECKS.flatMap(({ line, expectation, check }) => {
    const found = check(lines);

    return found === null ? [] : [`${line}: expected ${expectation}, but ${found}`];
  });
}

export function assertSpotChecks(lines: readonly LineRecord[]): void {
  const failures = spotCheck(lines);

  if (failures.length > 0) {
    throw new Error(
      `${failures.length} of ${SPOT_CHECKS.length} spot checks failed, so nothing was written:\n${failures.map(failure => `  ${failure}`).join('\n')}`,
    );
  }
}
