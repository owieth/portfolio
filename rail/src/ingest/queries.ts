/**
 * What the ingest step asks of `stop_times.txt`, as SQL.
 *
 * It lives apart from the step that runs it so it can be executed against a
 * handwritten fixture in a test, the same arrangement as `stations/queries.ts`.
 * The real file is over 3 GB and only exists on a machine that has run
 * `pnpm build:data`, which is not a thing a test may assume.
 *
 * The narrowing is done here rather than in TypeScript for the obvious reason:
 * 18 million rows never enter the process. DuckDB reads the CSV, keeps five
 * columns, sorts, and writes the result into the store, and the only thing that
 * crosses into JavaScript is the row count.
 */

import { STORE } from '../db.ts';

/**
 * The columns the pipeline keeps, and the only ones it reads.
 *
 * `trip_id` and `stop_id` are the grouping key and the payload — a stop pattern
 * is a trip's list of stops, and `stop_id` is the join to the stations step.
 * `stop_sequence` is the ordering authority; row order in the file is not
 * normative. `pickup_type` and `drop_off_type` are both `1` for a stop the train
 * passes without serving, which is not a stop you can board and so not part of a
 * line's sequence.
 *
 * Doubles as the cache signature: widening this list changes what a stored table
 * contains, and the ingest treats a stored table built from a different list as
 * stale rather than reusing it.
 */
export const KEPT_COLUMNS = [
  'trip_id',
  'stop_sequence',
  'stop_id',
  'pickup_type',
  'drop_off_type',
] as const;

/**
 * Checked by name before the load, so a mirror that does not carry a column
 * arrives as a sentence rather than as a DuckDB binder error from inside a query
 * that has already spent minutes reading.
 */
export const COLUMNS = `select column_name from (describe stop_times)`;

export interface ColumnRow {
  column_name: string;
}

/**
 * `stop_sequence` is the one column cast out of `all_varchar`. As text `'10'`
 * sorts before `'9'`, and a trip's stops in the wrong order is the one thing
 * this table exists to prevent. Everything else stays a string for the reason
 * `db.ts` gives: a `stop_id` with a leading zero stops joining the moment DuckDB
 * decides it is a number.
 *
 * `order by` is what earns a table over a view. Every later step walks a trip's
 * stops in order, and it is also the determinism rule the rest of the pipeline
 * already follows — DuckDB scans in parallel and would otherwise hand two runs
 * over the same feed a different row order.
 */
export const INGEST = `
  create or replace table ${STORE}.stop_times as
  select
    trip_id,
    cast(stop_sequence as integer) as stop_sequence,
    stop_id,
    coalesce(pickup_type, '') as pickup_type,
    coalesce(drop_off_type, '') as drop_off_type
  from stop_times
  order by trip_id, stop_sequence
`;

/**
 * What a stored table was built from, so a later run can tell whether it still
 * answers for the CSV on disk.
 *
 * One row per source rather than one row per store, because the steps after this
 * one will have their own tables to record and a table per ledger would be a
 * worse version of the same thing.
 */
export const LEDGER = `
  create table if not exists ${STORE}.ingest (
    source varchar primary key,
    bytes bigint not null,
    modified varchar not null,
    columns varchar not null,
    rows integer not null,
    trips integer not null,
    ingested_at varchar not null
  )
`;

export interface LedgerRow {
  bytes: string;
  modified: string;
  columns: string;
  rows: number;
  trips: number;
  ingested_at: string;
}

export const LEDGER_ROW = `
  select bytes, modified, columns, rows, trips, ingested_at
  from ${STORE}.ingest
  where source = 'stop_times'
`;

export const COUNT_ROWS = `select count(*)::integer as rows from ${STORE}.stop_times`;

export interface CountRow {
  rows: number;
}

/** Single-quoted SQL literal, the same escaping `db.ts` uses for a path. */
function literal(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export interface Ledger {
  bytes: number;
  modified: string;
  columns: string;
  rows: number;
  trips: number;
  ingestedAt: string;
}

/**
 * Written after the table rather than before it, so an interrupted run leaves a
 * ledger that lags. The cost of that is one redundant re-ingest; the cost of the
 * other order would be a half-written table the next run trusts.
 */
export function record(entry: Ledger): string {
  return `
    insert or replace into ${STORE}.ingest
      (source, bytes, modified, columns, rows, trips, ingested_at)
    values (
      'stop_times',
      ${entry.bytes},
      ${literal(entry.modified)},
      ${literal(entry.columns)},
      ${entry.rows},
      ${entry.trips},
      ${literal(entry.ingestedAt)}
    )
  `;
}

/**
 * Run once, after a load. `count(*)` is answered from row-group metadata but
 * `count(distinct trip_id)` is a hash aggregate over every row, so the trip count
 * goes into the ledger rather than being recomputed — a run that skips the load
 * would otherwise still pay to count 36 million rows, which is most of what
 * skipping was for.
 */
export const TOTALS = `
  select count(*)::integer as rows, count(distinct trip_id)::integer as trips
  from ${STORE}.stop_times
`;

export interface TotalsRow {
  rows: number;
  trips: number;
}
