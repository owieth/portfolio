/**
 * Step nine: give every line a name a person would say.
 *
 * A numbered line already has one — `IR35`, `S10`. A quarter of them do not: an
 * SBB `IC` whose number lives only in the train number, a bare `R` up a valley,
 * and every funicular, whose short name is a BAV code like `2350` that nobody
 * has ever said out loud. The merge step keys those on their terminals by Didok
 * number, which is stable and unreadable. This step reads a name off the same
 * patterns — operator, category and terminals, `RhB R Davos Platz-Landquart` —
 * and marks it as derived, so the report can put every one in front of a person
 * before anyone trusts it.
 *
 * The id is not touched. A name is allowed to be wrong in a way an id is not: a
 * derived name gets corrected by hand once the lines are in Postgres, and an id
 * that changed with it would orphan everything already recorded against it.
 *
 * Pure: it takes what the earlier steps returned and the operator table, and
 * opens nothing.
 */

import { createHash } from 'node:crypto';

import { compare } from './merge/key.ts';
import type { Line } from './merge.ts';
import { derivedName, namingCandidate, numberedName, terminalNames } from './naming/name.ts';
import type { Candidate } from './naming/name.ts';
import { verifyOperators } from './naming/operators.ts';
import type { Operator } from './naming/operators.ts';
import type { Pattern } from './patterns.ts';
import type { RegionedRoute } from './regions.ts';
import type { Station } from './stations.ts';

/** How many derived names the log prints as a sample. */
const SAMPLE_SHOWN = 5;

/**
 * Why a derived name needs more than the usual look.
 *
 * - `unknown-operator` — `data/operators.json` has no short name for the
 *   operator, so the name carries the feed's full one.
 * - `duplicate-name` — another derived line came out with the same name.
 */
export type ReviewReason = 'unknown-operator' | 'duplicate-name';

export interface NamedLine extends Line {
  name: string;
  /**
   * `number` for a line called by its public number, `derived` for one named
   * from operator, category and terminals. Every `derived` line is for review.
   */
  nameSource: 'number' | 'derived';
  /** Empty for a numbered line, and for a derived one with nothing unusual about it. */
  review: ReviewReason[];
}

/** An operator that was named with its full name for want of a short one. */
export interface Fallback {
  agencyId: string | null;
  operator: string;
  lines: number;
}

export interface Named {
  /** In the merge step's order, which is by id. */
  lines: NamedLine[];
  /** Lines named from operator, category and terminals. */
  derived: number;
  /** Operators with no entry in `data/operators.json`, most lines first. */
  fallbacks: Fallback[];
  /** One hash over every name, to compare two runs by. */
  fingerprint: string;
}

export interface NamingInput {
  lines: readonly Line[];
  routes: readonly RegionedRoute[];
  patterns: readonly Pattern[];
  stations: readonly Station[];
  operators: readonly Operator[];
}

type Log = (message: string) => void;

interface Choice {
  candidate: Candidate;
  fallback: RegionedRoute | null;
}

function count(value: number): string {
  return value.toLocaleString('en-US');
}

function plural(value: number, noun: string): string {
  return `${count(value)} ${value === 1 ? noun : `${noun}s`}`;
}

/**
 * A funicular carries a BAV code where other lines carry a number, and nobody
 * says `2350`, so it is named like a line with none.
 */
function isDerived(line: Line): boolean {
  return line.number === null || line.category === 'FUN';
}

function groupBy<T>(values: Iterable<T>, key: (value: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  for (const value of values) {
    const name = key(value);
    groups.set(name, [...(groups.get(name) ?? []), value]);
  }

  return groups;
}

/**
 * Every pattern of every route merged into the line is a candidate, spelled with
 * the operator of the route it came from, and the one `namingCandidate` picks
 * decides both the terminals and whose name goes in front.
 */
function choose(
  line: Line,
  routes: ReadonlyMap<string, RegionedRoute>,
  patterns: ReadonlyMap<string, Pattern[]>,
  stationNames: ReadonlyMap<string, string>,
  shortNames: ReadonlyMap<string, string>,
): Choice {
  const candidates: Choice[] = [];

  for (const routeId of line.routeIds) {
    const route = routes.get(routeId);

    if (route === undefined) {
      continue;
    }

    const short = route.agencyId === null ? undefined : shortNames.get(route.agencyId);

    for (const pattern of patterns.get(routeId) ?? []) {
      candidates.push({
        candidate: {
          stops: pattern.stations.length,
          trips: pattern.trips,
          terminals: terminalNames(pattern.stations, stationNames),
          operator: short ?? route.operator,
        },
        fallback: short === undefined ? route : null,
      });
    }
  }

  const best = namingCandidate(candidates.map(choice => choice.candidate));
  const choice = candidates.find(entry => entry.candidate === best);

  if (choice === undefined) {
    throw new Error(
      `line ${line.id} reached the naming step without a pattern; the merge and patterns steps no longer describe the same feed`,
    );
  }

  return choice;
}

function fallbacksOf(chosen: ReadonlyMap<string, Choice>): Fallback[] {
  const routes = [...chosen.values()].flatMap(choice =>
    choice.fallback === null ? [] : [choice.fallback],
  );

  return [...groupBy(routes, route => `${route.agencyId ?? ''}\u0000${route.operator}`).values()]
    .map(group => ({
      agencyId: group[0]?.agencyId ?? null,
      operator: group[0]?.operator ?? '',
      lines: group.length,
    }))
    .sort((a, b) => b.lines - a.lines || compare(a.operator, b.operator));
}

/**
 * Every field that naming adds, in id order, so two runs over the same feed can
 * be compared by reading one line of each log — the same arrangement as the
 * merge step's fingerprint.
 */
function fingerprintOf(lines: readonly NamedLine[]): string {
  const hash = createHash('sha256');

  for (const line of lines) {
    hash.update([line.id, line.name, line.nameSource, line.review.join(',')].join('|'));
    hash.update('\n');
  }

  return hash.digest('hex').slice(0, 16);
}

export function nameLines(input: NamingInput, log: Log): Named {
  const { lines, routes, patterns, stations, operators } = input;

  for (const problem of verifyOperators(operators, routes)) {
    log(`${problem}; fix data/operators.json`);
  }

  const routesById = new Map(routes.map(route => [route.routeId, route]));
  const patternsByRoute = groupBy(patterns, pattern => pattern.routeId);
  const stationNames = new Map(stations.map(station => [station.didok, station.name]));
  const shortNames = new Map(operators.map(operator => [operator.id, operator.short]));

  const chosen = new Map<string, Choice>();

  for (const line of lines) {
    if (isDerived(line)) {
      chosen.set(line.id, choose(line, routesById, patternsByRoute, stationNames, shortNames));
    }
  }

  const nameOf = (line: Line, withTerminals: boolean): string => {
    const choice = chosen.get(line.id);

    if (choice === undefined) {
      return numberedName(line.category, line.number ?? '');
    }

    return derivedName({
      category: line.category,
      operator: choice.candidate.operator,
      terminals: choice.candidate.terminals,
      withTerminals,
    });
  };

  // Two funiculars that would both be `Standseilbahn TPN` get their terminals.
  // Decided by the name rather than by the agency, so two agency ids that share
  // a short name are told apart the same way.
  const funiculars = lines.filter(line => line.category === 'FUN');
  const crowded = new Set(
    [...groupBy(funiculars, line => nameOf(line, false)).values()]
      .filter(group => group.length > 1)
      .flat()
      .map(line => line.id),
  );

  const named: NamedLine[] = lines.map(line => {
    const choice = chosen.get(line.id);

    return {
      ...line,
      name: nameOf(line, crowded.has(line.id)),
      nameSource: choice === undefined ? 'number' : 'derived',
      review: choice === undefined || choice.fallback === null ? [] : ['unknown-operator'],
    };
  });

  const derivedLines = named.filter(line => line.nameSource === 'derived');
  const duplicates = [...groupBy(derivedLines, line => line.name).entries()]
    .filter(([, group]) => group.length > 1)
    .sort(([a], [b]) => compare(a, b));

  for (const [, group] of duplicates) {
    for (const line of group) {
      line.review.push('duplicate-name');
    }
  }

  const fallbacks = fallbacksOf(chosen);
  const fingerprint = fingerprintOf(named);

  log(
    `${count(derivedLines.length)} of ${plural(named.length, 'line')} named from operator, category and terminals, ${count(crowded.size)} funiculars told apart by their terminals, fingerprint ${fingerprint}`,
  );

  if (derivedLines.length > 0) {
    log(
      `derived names, for review: ${derivedLines
        .slice(0, SAMPLE_SHOWN)
        .map(line => `${line.id} "${line.name}"`)
        .join('; ')}${derivedLines.length > SAMPLE_SHOWN ? '; …' : ''}`,
    );
  }

  for (const fallback of fallbacks) {
    log(
      `operator ${fallback.agencyId ?? '(no agency_id)'} ${fallback.operator} has no short name, so ${plural(fallback.lines, 'line')} ${fallback.lines === 1 ? 'carries' : 'carry'} its full name; add it to data/operators.json`,
    );
  }

  for (const [name, group] of duplicates) {
    log(
      `${plural(group.length, 'line')} are all named "${name}" — ${group.map(line => line.id).join(', ')}; they are different lines by id, and need telling apart by hand`,
    );
  }

  return { lines: named, derived: derivedLines.length, fallbacks, fingerprint };
}
