/**
 * What a refresh would do to `rail_lines` and `rail_line_stops`, as a pure
 * function of the feed's rows and the database's.
 *
 * A row is matched by its key: a line by its stable id, a stop by its line and
 * its place in the sequence. Then, for each row:
 *
 * - in the feed and not the database: inserted, and listed for review;
 * - in both: every field the feed changed is written, unless the field is in
 *   the row's `edited_fields`, in which case the edit stays and the field is
 *   listed as skipped. A hand-edited stop whose sequence number now names a
 *   different station refuses the whole plan, because its edit was made on the
 *   station that moved;
 * - in the database and not the feed: flagged with `missing_since`, never
 *   deleted, because rides may already reference it. A row that was flagged and
 *   is back in the feed has the flag cleared.
 *
 * The dry run prints this plan and the apply executes it, re-planned inside the
 * transaction that writes it, so what the dry run showed is what the apply does
 * as long as nothing changed in between.
 */

import { isDeepStrictEqual } from 'node:util';

import { compare } from '../merge/key.ts';
import { LINE_FIELDS, STOP_FIELDS } from './rows.ts';
import type { Feed, FeedLine, FeedStop, State, Tracked } from './rows.ts';

/** The columns that identify a row, and their values. */
export type Key = Record<string, string | number>;

export interface Target {
  key: Key;
  /** `fernverkehr:IR35`, or `fernverkehr:IR35 #3` for its third stop. */
  label: string;
  /** The line's display name or the stop's name, as the database has it. */
  name: string;
}

export interface Change {
  field: string;
  from: unknown;
  to: unknown;
}

export interface Update<Row> extends Target {
  set: Partial<Row>;
  changes: Change[];
}

export interface Skipped extends Target {
  field: string;
  /** The hand-edited value, which stays. */
  kept: unknown;
  /** What the feed says now, which is not written. */
  feed: unknown;
}

export interface TablePlan<Row> {
  inserts: Row[];
  updates: Update<Row>[];
  skipped: Skipped[];
  flagged: Target[];
  restored: Target[];
  /** Flagged by an earlier reconcile and still gone. */
  stillMissing: number;
  unchanged: number;
}

export interface Plan {
  lines: TablePlan<FeedLine>;
  stops: TablePlan<FeedStop>;
}

interface Table<Row> {
  file: string;
  keys: readonly (keyof Row & string)[];
  fields: readonly (keyof Row & string)[];
  label: (row: Row) => string;
  name: (row: Row) => string;
  /** Whether a key-matched row still describes the same place. */
  sameStation?: (feed: Row, stored: Row & Tracked) => boolean;
  /** The row's place, as a refusal names it. */
  station?: (row: Row) => string;
}

const LINES: Table<FeedLine> = {
  file: 'lines.csv',
  keys: ['id'],
  fields: LINE_FIELDS,
  label: line => line.id,
  name: line => line.display_name,
};

/** A stop's station, by the first of these both sides have and nobody edited. */
const STATION_IDS = ['didok', 'sloid'] as const;

const STOPS: Table<FeedStop> = {
  file: 'line_stops.csv',
  keys: ['line_id', 'sequence'],
  fields: STOP_FIELDS,
  label: stop => `${stop.line_id} #${stop.sequence}`,
  name: stop => stop.stop_name,
  sameStation: (feed, stored) => {
    for (const field of STATION_IDS) {
      if (stored.edited_fields.includes(field)) {
        continue;
      }

      if (feed[field] !== null && stored[field] !== null) {
        return feed[field] === stored[field];
      }
    }

    return true;
  },
  station: stop => `${stop.stop_name} (${stop.didok ?? stop.sloid ?? 'no Didok'})`,
};

function targetOf<Row>(table: Table<Row>, row: Row): Target {
  return {
    key: Object.fromEntries(table.keys.map(key => [key, row[key]])) as Key,
    label: table.label(row),
    name: table.name(row),
  };
}

function identity<Row>(table: Table<Row>, row: Row): string {
  return JSON.stringify(table.keys.map(key => row[key]));
}

/** Key column by key column, so stop 10 sorts after stop 9 rather than after 1. */
function byKey(a: Target, b: Target): number {
  for (const [column, left] of Object.entries(a.key)) {
    const right = b.key[column];

    if (left !== right) {
      return typeof left === 'number' && typeof right === 'number'
        ? left - right
        : compare(String(left), String(right));
    }
  }

  return 0;
}

function planTable<Row>(
  table: Table<Row>,
  feed: readonly Row[],
  database: readonly (Row & Tracked)[],
): TablePlan<Row> {
  const stored = new Map(database.map(row => [identity(table, row), row]));
  const seen = new Set<string>();
  const moved: string[] = [];
  const plan: TablePlan<Row> = {
    inserts: [],
    updates: [],
    skipped: [],
    flagged: [],
    restored: [],
    stillMissing: 0,
    unchanged: 0,
  };

  for (const row of feed) {
    const id = identity(table, row);

    if (seen.has(id)) {
      throw new Error(`${table.file} has ${table.label(row)} twice`);
    }

    seen.add(id);

    const current = stored.get(id);

    if (current === undefined) {
      plan.inserts.push(row);
      continue;
    }

    if (current.edited_fields.length > 0 && table.sameStation?.(row, current) === false) {
      const station = table.station ?? table.name;
      moved.push(
        `${table.label(row)} is now ${station(row)}, but its edits to ` +
          `${current.edited_fields.join(', ')} were made on ${station(current)}`,
      );
      continue;
    }

    const target = targetOf(table, current);
    const edited = new Set<string>(current.edited_fields);
    const set: Partial<Row> = {};
    const changes: Change[] = [];

    for (const field of table.fields) {
      if (isDeepStrictEqual(row[field], current[field])) {
        continue;
      }

      if (edited.has(field)) {
        plan.skipped.push({ ...target, field, kept: current[field], feed: row[field] });
        continue;
      }

      set[field] = row[field];
      changes.push({ field, from: current[field], to: row[field] });
    }

    if (current.missing_since !== null) {
      plan.restored.push(target);
    }

    if (changes.length > 0) {
      plan.updates.push({ ...target, set, changes });
    } else if (current.missing_since === null) {
      plan.unchanged += 1;
    }
  }

  if (moved.length > 0) {
    throw new Error(
      [
        `${table.file} would move hand edits onto another station:`,
        ...moved.map(row => `- ${row}`),
        'Clear edited_fields on those rows, apply, then redo the edit where the station moved.',
      ].join('\n'),
    );
  }

  for (const [id, row] of stored) {
    if (seen.has(id)) {
      continue;
    }

    if (row.missing_since === null) {
      plan.flagged.push(targetOf(table, row));
    } else {
      plan.stillMissing += 1;
    }
  }

  plan.flagged.sort(byKey);

  return plan;
}

export function planReconcile(feed: Feed, state: State): Plan {
  return {
    lines: planTable(LINES, feed.lines, state.lines),
    stops: planTable(STOPS, feed.stops, state.stops),
  };
}

/** Whether applying the plan would write anything at all. */
export function isEmpty({ lines, stops }: Plan): boolean {
  return [lines, stops].every(
    table =>
      table.inserts.length === 0 &&
      table.updates.length === 0 &&
      table.flagged.length === 0 &&
      table.restored.length === 0,
  );
}
