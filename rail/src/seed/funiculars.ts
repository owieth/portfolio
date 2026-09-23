/**
 * The lines the feed does not have, written down by hand.
 *
 * A funicular with no tariff integration has no obligation to publish a
 * timetable, and the one that does not publish is still a line to ride. Those
 * live in `data/funiculars.json`, one entry per line, with everything the feed
 * would otherwise have supplied: an id, a name, the operator, the category, and
 * the stops in running order with their coordinates.
 *
 * The terminals are the first and last stop rather than a field of their own,
 * because two copies of the same fact are two places for it to be wrong.
 *
 * The id is written out rather than derived, so it survives a stop being added
 * or renamed. Its first part is the region, and a funicular's region is its
 * operator's slug, the same as `byOperator` files the feed's funiculars under.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { isInChBbox } from '../../../src/lib/geo/ch.ts';
import { CATEGORIES } from '../allowlist/categories.ts';
import type { Category } from '../allowlist/categories.ts';
import { DATA_DIR } from '../paths.ts';
import { SWISS_COUNTRY } from '../stations/switzerland.ts';

export const FUNICULARS_FILE = join(DATA_DIR, 'funiculars.json');

export interface SeedStop {
  /** `undefined` for a stop the service-point register does not know. */
  didok?: string;
  name: string;
  lat: number;
  lon: number;
}

export interface SeedLine {
  /** `region:…`, in the same shape as a feed line's id. */
  id: string;
  name: string;
  /** The operator's full name. */
  operator: string;
  category: Category;
  /** In running order, at least two. */
  stops: SeedStop[];
  /** Why it is here, for the reviewer. JSON has no comments. */
  note?: string;
}

const LINE_KEYS = new Set(['id', 'name', 'operator', 'category', 'stops', 'note']);
const STOP_KEYS = new Set(['didok', 'name', 'lat', 'lon']);

/** A region slug, a colon, then what `compactNumber` allows plus `:`. */
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*:[A-Za-z0-9._:-]+$/;

const DIDOK = new RegExp(`^${SWISS_COUNTRY}\\d{5}$`);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && Object.hasOwn(CATEGORIES, value);
}

function unknownKeys(entry: Record<string, unknown>, known: ReadonlySet<string>): string[] {
  return Object.keys(entry)
    .filter(key => !known.has(key))
    .map(key => `has an unknown key "${key}"`);
}

function stopProblems(stop: Record<string, unknown>): string[] {
  const found = unknownKeys(stop, STOP_KEYS);

  if (!isNonEmptyString(stop.name)) {
    found.push('needs "name" as text');
  }

  if (typeof stop.lat !== 'number' || typeof stop.lon !== 'number') {
    found.push('needs "lat" and "lon" as numbers');
  } else if (!isInChBbox({ lat: stop.lat, lon: stop.lon })) {
    found.push(`is at ${stop.lat}, ${stop.lon}, which is not in Switzerland`);
  }

  if (stop.didok !== undefined && (typeof stop.didok !== 'string' || !DIDOK.test(stop.didok))) {
    found.push(`has "didok" ${JSON.stringify(stop.didok)}, which is not a Swiss Didok number`);
  }

  return found;
}

function lineProblems(entry: Record<string, unknown>, label: string): string[] {
  const found = unknownKeys(entry, LINE_KEYS).map(problem => `${label} ${problem}`);

  for (const key of ['id', 'name', 'operator'] as const) {
    if (!isNonEmptyString(entry[key])) {
      found.push(`${label} needs "${key}" as text`);
    }
  }

  if (typeof entry.id === 'string' && !ID.test(entry.id)) {
    found.push(`${label} has id "${entry.id}", which is not region:… in a line id's characters`);
  }

  if (!isCategory(entry.category)) {
    found.push(`${label} has category ${JSON.stringify(entry.category)}, which is not one you can ride`);
  }

  if (entry.note !== undefined && !isNonEmptyString(entry.note)) {
    found.push(`${label} has a "note" that is not text`);
  }

  if (!Array.isArray(entry.stops) || entry.stops.length < 2) {
    found.push(`${label} needs "stops" as a list of at least two`);
    return found;
  }

  entry.stops.forEach((stop: unknown, index) => {
    const stopLabel = `${label} stop ${index + 1}`;

    if (!isRecord(stop)) {
      found.push(`${stopLabel} is not an object`);
      return;
    }

    for (const problem of stopProblems(stop)) {
      found.push(`${stopLabel} ${problem}`);
    }
  });

  return found;
}

/**
 * Every problem in the file, not just the first, so a bad edit is fixed in one
 * pass rather than one rerun per mistake — the same contract as `parseOperators`.
 */
export function parseFunicularSeed(json: unknown, source: string): SeedLine[] {
  if (!isRecord(json) || !Array.isArray(json.funiculars)) {
    throw new Error(`${source} must be an object with a "funiculars" list`);
  }

  const errors: string[] = [];
  const seen = new Set<string>();

  json.funiculars.forEach((entry: unknown, index) => {
    const label = `${source}: funicular ${index + 1}`;

    if (!isRecord(entry)) {
      errors.push(`${label} is not an object`);
      return;
    }

    errors.push(...lineProblems(entry, label));

    if (typeof entry.id === 'string') {
      if (seen.has(entry.id)) {
        errors.push(`${label} repeats id ${entry.id}`);
      }

      seen.add(entry.id);
    }
  });

  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }

  return json.funiculars as SeedLine[];
}

export async function loadFunicularSeed(path: string = FUNICULARS_FILE): Promise<SeedLine[]> {
  const text = await readFile(path, 'utf8');

  let json: unknown;

  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new Error(`${path} is not valid JSON`, { cause: error });
  }

  return parseFunicularSeed(json, path);
}
