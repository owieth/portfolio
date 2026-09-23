/**
 * What a line with no number is called, as pure functions over values.
 *
 * They live apart from the step so each decision can be tested on its own: which
 * pattern a name is read off, which two station names end it, and how the parts
 * are put together. The id is the merge step's business and is never touched
 * here; a name is what a person reads, and it only has to be as stable as the
 * feed underneath it.
 *
 * Every comparison is by code unit, through the same `compare` the merge step
 * uses, for the same reason: a collation that depends on the ICU build and the
 * machine's locale is a way for one feed to name a line two ways on two laptops.
 */

import type { Category } from '../allowlist/categories.ts';
import { compare } from '../merge/key.ts';

/**
 * One pattern a line runs, as far as naming cares: how long it is, how often it
 * runs, the names of its two ends and who runs it.
 */
export interface Candidate {
  /** Stations served, first to last. */
  stops: number;
  trips: number;
  /** Station names of the two ends, in code-unit order. */
  terminals: [string, string];
  /** The operator as the name spells it. */
  operator: string;
}

/**
 * The first and last station of a pattern by name, in code-unit order rather
 * than running order, so Landquart to Davos Platz and Davos Platz to Landquart
 * are one pair and name one line. A station the stations step did not name keeps
 * its Didok number, which is ugly on purpose: the report shows it.
 */
export function terminalNames(
  stations: readonly string[],
  names: ReadonlyMap<string, string>,
): [string, string] {
  const first = stations[0] ?? '';
  const last = stations.at(-1) ?? first;
  const [a, b] = [names.get(first) ?? first, names.get(last) ?? last];

  return compare(a, b) <= 0 ? [a, b] : [b, a];
}

function compareCandidates(a: Candidate, b: Candidate): number {
  return (
    b.stops - a.stops ||
    b.trips - a.trips ||
    compare(a.terminals[0], b.terminals[0]) ||
    compare(a.terminals[1], b.terminals[1]) ||
    compare(a.operator, b.operator)
  );
}

/**
 * The pattern a line is named after: the longest, then the one with the most
 * trips, then the lexically first pair of terminal names, then the lexically
 * first operator. Longest before busiest, because a line is named for where it
 * goes, and a short-turn that runs twice as often does not go as far.
 *
 * The name is made of nothing but the terminals and the operator, so a tie that
 * survives all four — two patterns with the same ends, length and trips that
 * differ only in the stations between — cannot change it.
 */
export function namingCandidate(candidates: readonly Candidate[]): Candidate | null {
  return [...candidates].sort(compareCandidates)[0] ?? null;
}

/**
 * What a funicular's category is called in the name. German, the language of
 * most of the 53 and of the issue that asked for them; the operator does the
 * rest of the work, so `Standseilbahn Polybahn` reads fine in Lausanne too.
 */
export const FUNICULAR = 'Standseilbahn';

/**
 * `ZUG` is the feed's code for "train", which says nothing, and printed into a
 * name it reads as the city of Zug. It is left out rather than guessed at.
 */
const UNSPECIFIED: Category = 'ZUG';

export interface NameParts {
  category: Category;
  operator: string;
  terminals: [string, string];
  /** Only read for a funicular: whether its terminals are needed to tell it apart. */
  withTerminals?: boolean;
}

/**
 * Operator, category and terminals: `RhB R Davos Platz-Landquart`. A funicular
 * is one operator's one line almost everywhere, so it is named for the operator
 * alone, `Standseilbahn Polybahn`, and gains its terminals only when the same
 * operator has a second one to be told apart from.
 */
export function derivedName(parts: NameParts): string {
  const ends = parts.terminals.join('-');

  if (parts.category === 'FUN') {
    const name = `${FUNICULAR} ${parts.operator}`;
    return parts.withTerminals === true ? `${name} ${ends}` : name;
  }

  if (parts.category === UNSPECIFIED) {
    return `${parts.operator} ${ends}`;
  }

  return `${parts.operator} ${parts.category} ${ends}`;
}

/**
 * A numbered line is called by its number, with the category in front when the
 * number does not already say it — the same test the id makes, so `IR35` stays
 * `IR35` and the ICE `3` is `ICE 3`.
 */
export function numberedName(category: Category, number: string): string {
  return number.toUpperCase().startsWith(category) ? number : `${category} ${number}`;
}
