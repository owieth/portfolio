/**
 * The rows the reconcile compares, typed the way Postgres hands them back: lists
 * as arrays, flags as booleans, counts and coordinates as numbers.
 *
 * `parseCsv` gives every cell as a string or null. A string would never equal
 * the number in the database, so a reconcile that compared the two would plan an
 * update to every row. The cells are converted here once, key by key, and a
 * cell that does not read as its column's type stops the reconcile before it
 * plans anything.
 */

import type { CsvRow } from '../diff/csv.ts';
import { LIST_SEPARATOR } from '../emit/csv.ts';

export interface FeedLine {
  id: string;
  display_name: string;
  category: string;
  network_region: string;
  operators: string[];
  terminal_a: string;
  terminal_b: string;
  true_terminal_a: string;
  true_terminal_b: string;
  route_ids: string[];
  seasonal: boolean | null;
  trips_per_week: number | null;
  has_geometry: boolean;
}

export interface FeedStop {
  line_id: string;
  sequence: number;
  stop_name: string;
  sloid: string | null;
  didok: string | null;
  lat: number | null;
  lon: number | null;
  via: string;
  junction: string | null;
}

/** The two columns the migration adds for the reconcile, and nothing else writes. */
export interface Tracked {
  edited_fields: string[];
  /** `YYYY-MM-DD`, read as text so it compares as it was written. */
  missing_since: string | null;
}

export type DbLine = FeedLine & Tracked;
export type DbStop = FeedStop & Tracked;

export interface Feed {
  lines: FeedLine[];
  stops: FeedStop[];
}

export interface State {
  lines: DbLine[];
  stops: DbStop[];
}

/** Every column the feed owns, which is every column a reconcile may write. */
export const LINE_FIELDS = [
  'display_name',
  'category',
  'network_region',
  'operators',
  'terminal_a',
  'terminal_b',
  'true_terminal_a',
  'true_terminal_b',
  'route_ids',
  'seasonal',
  'trips_per_week',
  'has_geometry',
] as const satisfies readonly (keyof FeedLine)[];

export const STOP_FIELDS = [
  'stop_name',
  'sloid',
  'didok',
  'lat',
  'lon',
  'via',
  'junction',
] as const satisfies readonly (keyof FeedStop)[];

const BOOLEAN = /^(true|false)$/;
const INTEGER = /^-?\d+$/;
const NUMBER = /^-?\d+(\.\d+)?$/;

/**
 * Typed reads of one row's cells. Every error names the file, the row and the
 * column, because the alternative is a Postgres error about a parameter.
 */
function cellsOf(row: CsvRow, where: string) {
  const cell = (column: string): string | null => {
    if (!(column in row)) {
      throw new Error(`${where} has no ${column} column`);
    }

    return row[column];
  };

  const present = <T>(column: string, value: T | null): T => {
    if (value === null) {
      throw new Error(`${where} ${column} is empty`);
    }

    return value;
  };

  const matching = (column: string, pattern: RegExp, kind: string): string | null => {
    const value = cell(column);

    if (value !== null && !pattern.test(value)) {
      throw new Error(
        `${where} ${column} is ${JSON.stringify(value)}, which is not ${kind}`,
      );
    }

    return value;
  };

  const optionalBoolean = (column: string): boolean | null => {
    const value = matching(column, BOOLEAN, 'a boolean');

    return value === null ? null : value === 'true';
  };

  const optionalInteger = (column: string): number | null => {
    const value = matching(column, INTEGER, 'an integer');

    return value === null ? null : Number(value);
  };

  return {
    optionalText: cell,
    text: (column: string): string => present(column, cell(column)),
    /** An empty list is written as an empty field. */
    list: (column: string): string[] => cell(column)?.split(LIST_SEPARATOR) ?? [],
    optionalBoolean,
    boolean: (column: string): boolean => present(column, optionalBoolean(column)),
    optionalInteger,
    integer: (column: string): number => present(column, optionalInteger(column)),
    optionalNumber: (column: string): number | null => {
      const value = matching(column, NUMBER, 'a number');

      return value === null ? null : Number(value);
    },
  };
}

export function feedLine(row: CsvRow, index: number): FeedLine {
  const cells = cellsOf(row, `lines.csv row ${index + 2}`);

  return {
    id: cells.text('id'),
    display_name: cells.text('display_name'),
    category: cells.text('category'),
    network_region: cells.text('network_region'),
    operators: cells.list('operators'),
    terminal_a: cells.text('terminal_a'),
    terminal_b: cells.text('terminal_b'),
    true_terminal_a: cells.text('true_terminal_a'),
    true_terminal_b: cells.text('true_terminal_b'),
    route_ids: cells.list('route_ids'),
    seasonal: cells.optionalBoolean('seasonal'),
    trips_per_week: cells.optionalInteger('trips_per_week'),
    has_geometry: cells.boolean('has_geometry'),
  };
}

export function feedStop(row: CsvRow, index: number): FeedStop {
  const cells = cellsOf(row, `line_stops.csv row ${index + 2}`);

  return {
    line_id: cells.text('line_id'),
    sequence: cells.integer('sequence'),
    stop_name: cells.text('stop_name'),
    sloid: cells.optionalText('sloid'),
    didok: cells.optionalText('didok'),
    lat: cells.optionalNumber('lat'),
    lon: cells.optionalNumber('lon'),
    via: cells.text('via'),
    junction: cells.optionalText('junction'),
  };
}

export function feedOf(lines: readonly CsvRow[], stops: readonly CsvRow[]): Feed {
  return { lines: lines.map(feedLine), stops: stops.map(feedStop) };
}
