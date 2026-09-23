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
 *   listed as skipped;
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
}

const LINES: Table<FeedLine> = {
  file: 'lines.csv',
  keys: ['id'],
  fields: LINE_FIELDS,
  label: line => line.id,
  name: line => line.display_name,
};

const STOPS: Table<FeedStop> = {
  file: 'line_stops.csv',
  keys: ['line_id', 'sequence'],
  fields: STOP_FIELDS,
  label: stop => `${stop.line_id} #${stop.sequence}`,
  name: stop => stop.stop_name,
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
