/**
 * What changed between two snapshots of `lines.csv` and `line_stops.csv`: the
 * committed one and the one a build just wrote.
 *
 * A text diff of the two files already shows every changed row. This says what
 * the rows mean, in the terms the reconcile in #488 will act on: which ids are
 * new, which are gone, which kept their id under a new name, and which lines
 * serve different stops. It also pairs a removed line with an added one when
 * both run between the same two terminals, because an id is a region and a
 * number, and a line renumbered at the timetable switch comes out as one of each.
 *
 * Pure, and every list is sorted by code unit, so the same two snapshots always
 * give the same summary.
 */

import { compare } from '../merge/key.ts';
import type { CsvRow } from './csv.ts';

export interface DiffLine {
  id: string;
  display_name: string;
  category: string;
  network_region: string;
  terminal_a: string;
  terminal_b: string;
}

export interface DiffStop {
  line_id: string;
  stop_name: string;
  /** `null` only for a hand-seeded stop the service-point register does not know. */
  didok: string | null;
}

export interface Snapshot {
  lines: DiffLine[];
  stops: DiffStop[];
}

export interface Renamed {
  id: string;
  before: string;
  after: string;
}

export interface Renumbered {
  before: DiffLine;
  after: DiffLine;
}

/** How many lines one category or one region has on each side. */
export interface Shift {
  key: string;
  before: number;
  after: number;
}

export interface StopChange {
  id: string;
  display_name: string;
  added: DiffStop[];
  removed: DiffStop[];
}

export interface Comparison {
  lines: { before: number; after: number };
  stops: { before: number; after: number };
  added: DiffLine[];
  removed: DiffLine[];
  renamed: Renamed[];
  /** Kept out of `added` and `removed`: each pair is listed here only. */
  renumbered: Renumbered[];
  recategorised: Renamed[];
  categories: Shift[];
  regions: Shift[];
  stopChanges: StopChange[];
}

const LINE_FIELDS = [
  'id',
  'display_name',
  'category',
  'network_region',
  'terminal_a',
  'terminal_b',
] as const;

function required(row: CsvRow, column: string, file: string, index: number): string {
  const value = row[column];

  if (value === undefined || value === null) {
    throw new Error(`${file} row ${index + 2} has no ${column}`);
  }

  return value;
}

/** The columns the diff reads, checked so a renamed column fails loudly. */
export function snapshotOf(lines: readonly CsvRow[], stops: readonly CsvRow[]): Snapshot {
  return {
    lines: lines.map((row, index) => {
      const [id, display_name, category, network_region, terminal_a, terminal_b] =
        LINE_FIELDS.map(column => required(row, column, 'lines.csv', index));

      return { id, display_name, category, network_region, terminal_a, terminal_b };
    }),
    stops: stops.map((row, index) => ({
      line_id: required(row, 'line_id', 'line_stops.csv', index),
      stop_name: required(row, 'stop_name', 'line_stops.csv', index),
      didok: row.didok ?? null,
    })),
  };
}

function byId(lines: readonly DiffLine[]): Map<string, DiffLine> {
  return new Map(lines.map(line => [line.id, line]));
}

function sortById(lines: DiffLine[]): DiffLine[] {
  return lines.sort((a, b) => compare(a.id, b.id));
}

/** Both directions of a line give one pair, as they give one name. */
function terminalPair(line: DiffLine): string {
  return [line.terminal_a, line.terminal_b].sort(compare).join('\u0000');
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  for (const item of items) {
    const group = groups.get(key(item));

    if (group === undefined) {
      groups.set(key(item), [item]);
    } else {
      group.push(item);
    }
  }

  return groups;
}

/**
 * A removed and an added line are paired only when each is the other's only
 * candidate. Two S-Bahn lines that both run Zürich HB to Winterthur stay in the
 * added and removed lists rather than being paired by a guess.
 */
function pairRenumbered(removed: DiffLine[], added: DiffLine[]): Renumbered[] {
  const gone = groupBy(removed, terminalPair);
  const fresh = groupBy(added, terminalPair);
  const pairs: Renumbered[] = [];

  for (const [pair, [before, ...others]] of gone) {
    const candidates = fresh.get(pair);

    if (others.length === 0 && candidates?.length === 1) {
      pairs.push({ before, after: candidates[0] });
    }
  }

  return pairs.sort((a, b) => compare(a.before.id, b.before.id));
}

function shifts(
  before: readonly DiffLine[],
  after: readonly DiffLine[],
  key: (line: DiffLine) => string,
): Shift[] {
  const counted = (lines: readonly DiffLine[]) =>
    new Map([...groupBy(lines, key)].map(([value, group]) => [value, group.length]));
  const was = counted(before);
  const is = counted(after);

  return [...new Set([...was.keys(), ...is.keys()])]
    .sort(compare)
    .map(value => ({ key: value, before: was.get(value) ?? 0, after: is.get(value) ?? 0 }))
    .filter(shift => shift.before !== shift.after);
}

/** A stop is its Didok number; a seeded stop without one is its name. */
function stopKey(stop: DiffStop): string {
  return stop.didok ?? `name:${stop.stop_name}`;
}

/**
 * Which stations a line serves, as a set. A stop that only moved within the
 * sequence is not a change here: `line_stops.csv`'s own diff shows that, and
 * what a rider has ticked off is a set of stations.
 */
function stopChanges(
  before: Snapshot,
  after: Snapshot,
  kept: readonly DiffLine[],
): StopChange[] {
  const was = groupBy(before.stops, stop => stop.line_id);
  const is = groupBy(after.stops, stop => stop.line_id);
  const missing = (from: DiffStop[], against: DiffStop[]) => {
    const keys = new Set(against.map(stopKey));

    return from.filter(stop => !keys.has(stopKey(stop)));
  };

  return kept
    .map(line => {
      const old = was.get(line.id) ?? [];
      const now = is.get(line.id) ?? [];

      return {
        id: line.id,
        display_name: line.display_name,
        added: missing(now, old),
        removed: missing(old, now),
      };
    })
    .filter(change => change.added.length > 0 || change.removed.length > 0);
}

export function compareSnapshots(before: Snapshot, after: Snapshot): Comparison {
  const was = byId(before.lines);
  const is = byId(after.lines);
  const kept = sortById(after.lines.filter(line => was.has(line.id)));
  const removed = sortById(before.lines.filter(line => !is.has(line.id)));
  const added = sortById(after.lines.filter(line => !was.has(line.id)));
  const renumbered = pairRenumbered(removed, added);
  const paired = new Set(renumbered.flatMap(pair => [pair.before.id, pair.after.id]));
  const changed = (field: 'display_name' | 'category'): Renamed[] =>
    kept.flatMap(line => {
      const old = was.get(line.id)![field];

      return old === line[field] ? [] : [{ id: line.id, before: old, after: line[field] }];
    });

  return {
    lines: { before: before.lines.length, after: after.lines.length },
    stops: { before: before.stops.length, after: after.stops.length },
    added: added.filter(line => !paired.has(line.id)),
    removed: removed.filter(line => !paired.has(line.id)),
    renamed: changed('display_name'),
    renumbered,
    recategorised: changed('category'),
    categories: shifts(before.lines, after.lines, line => line.category),
    regions: shifts(before.lines, after.lines, line => line.network_region),
    stopChanges: stopChanges(before, after, kept),
  };
}

/** Whether anything the summary reports changed at all. */
export function isUnchanged(comparison: Comparison): boolean {
  return (
    comparison.added.length === 0 &&
    comparison.removed.length === 0 &&
    comparison.renamed.length === 0 &&
    comparison.renumbered.length === 0 &&
    comparison.recategorised.length === 0 &&
    comparison.stopChanges.length === 0
  );
}
