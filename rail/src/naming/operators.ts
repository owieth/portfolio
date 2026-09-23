/**
 * What an operator is called in a line's name, as a table rather than as code.
 *
 * `agency.txt` has one name per operator and it is the registered one —
 * `Rhätische Bahn`, `Poly-Bahn Zürich`, `Matterhorn Gotthard Bahn (fo)` — which
 * is not what is painted on the train or said on the platform. Nothing in the
 * feed carries the short form, so it is written down in `data/operators.json`,
 * keyed by `agency_id` with the feed's name next to it, the same arrangement as
 * `data/regions.json`: the id is what matches, the name is for the reviewer, and
 * the step checks the name against the feed rather than trusting it.
 *
 * An operator missing from the table is not an error. Its line is named with the
 * full name from the feed and flagged for review, so a new operator in a future
 * feed arrives as a long name in the report rather than a failed build.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { DATA_DIR } from '../paths.ts';

export const OPERATORS_FILE = join(DATA_DIR, 'operators.json');

export interface Operator {
  /** The feed's `agency_id`. */
  id: string;
  /** The feed's `agency_name`, checked against it. */
  name: string;
  /** What the name of a line calls it. */
  short: string;
  /** Why it is spelled that way, for the reviewer. JSON has no comments. */
  note?: string;
}

/** What the table is checked against: an operator as the feed has it. */
export interface FeedOperator {
  agencyId: string | null;
  operator: string;
}

const OPERATOR_KEYS = new Set(['id', 'name', 'short', 'note']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function problems(entry: Record<string, unknown>): string[] {
  const found: string[] = [];

  for (const key of Object.keys(entry)) {
    if (!OPERATOR_KEYS.has(key)) {
      found.push(`has an unknown key "${key}"`);
    }
  }

  for (const key of ['id', 'name', 'short'] as const) {
    if (!isNonEmptyString(entry[key])) {
      found.push(`needs "${key}" as text`);
    }
  }

  if (entry.note !== undefined && !isNonEmptyString(entry.note)) {
    found.push('has a "note" that is not text');
  }

  return found;
}

/**
 * Every problem in the file, not just the first, so a bad edit is fixed in one
 * pass rather than one rerun per mistake — the same contract as `parseRules`.
 */
export function parseOperators(json: unknown, source: string): Operator[] {
  if (!isRecord(json) || !Array.isArray(json.operators)) {
    throw new Error(`${source} must be an object with an "operators" list`);
  }

  const errors: string[] = [];
  const seen = new Set<string>();

  json.operators.forEach((entry: unknown, index) => {
    const label = `${source}: operator ${index + 1}`;

    if (!isRecord(entry)) {
      errors.push(`${label} is not an object`);
      return;
    }

    for (const problem of problems(entry)) {
      errors.push(`${label} ${problem}`);
    }

    if (typeof entry.id === 'string') {
      if (seen.has(entry.id)) {
        errors.push(`${label} repeats agency_id ${entry.id}`);
      }

      seen.add(entry.id);
    }
  });

  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }

  return json.operators as Operator[];
}

export async function loadOperators(path: string = OPERATORS_FILE): Promise<Operator[]> {
  const text = await readFile(path, 'utf8');

  let json: unknown;

  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new Error(`${path} is not valid JSON`, { cause: error });
  }

  return parseOperators(json, path);
}

/**
 * An entry the feed cannot back up is reported, not fatal: the feed renames an
 * operator more often than it renumbers one, and an entry whose agency has gone
 * is one that stops matching, which the fallback names in the report show
 * anyway. It is reported so the cause sits next to the symptom.
 */
export function verifyOperators(
  operators: readonly Operator[],
  feed: readonly FeedOperator[],
): string[] {
  const names = new Map<string, string>();

  for (const { agencyId, operator } of feed) {
    if (agencyId !== null) {
      names.set(agencyId, operator);
    }
  }

  const found: string[] = [];

  for (const entry of operators) {
    const actual = names.get(entry.id);

    if (actual === undefined) {
      found.push(
        `operator ${entry.id} ${entry.name} runs no allowed route in this feed; it may be stale`,
      );
    } else if (actual !== entry.name) {
      found.push(`operator ${entry.id} is ${actual} in the feed, not ${entry.name}`);
    }
  }

  return found;
}
