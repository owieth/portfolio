/**
 * A DuckDB database with the GTFS files of one feed registered as views.
 *
 * Views rather than tables, because DuckDB reads the CSVs lazily and a step that
 * only needs `routes.txt` should not pay for anything else. `stop_times.txt`
 * alone inflates past 3 GB, so "load the feed" can never mean "load all of it".
 *
 * Every column is read as `VARCHAR`. GTFS ids and line numbers are strings that
 * happen to look numeric — `route_short_name` `007` is not 7, and a `stop_id`
 * with a leading zero stops joining once DuckDB has decided it is an integer.
 * Nothing here is arithmetic, so there is no reason to infer a type at all.
 *
 * The database itself is in-memory and dies with the step. A step that has
 * something worth keeping passes a `store`, which is attached as a second
 * catalog: the views stay ephemeral, and only the tables the step writes into
 * `store.` survive the run. The store lives inside the feed's own directory, so
 * `rm -rf data/raw/<feed-id>` still deletes a feed and everything derived from
 * it in one go — it is not a second lifetime to keep track of.
 */

import { stat } from 'node:fs/promises';
import { join } from 'node:path';

import { DuckDBInstance } from '@duckdb/node-api';
import type { DuckDBConnection } from '@duckdb/node-api';

/** The GTFS member names this pipeline reads, without the `.txt`. */
export type GtfsFile =
  | 'agency'
  | 'calendar'
  | 'calendar_dates'
  | 'feed_info'
  | 'routes'
  | 'stop_times'
  | 'stops'
  | 'trips';

/**
 * Pinned rather than left to DuckDB's default of 80% of system RAM, so ingesting
 * the same feed costs the same on a 16 GB laptop and a 64 GB one instead of
 * quietly becoming a different program on each. Past the ceiling DuckDB spills to
 * `temp_directory`; it does not grow, and it does not push the machine into swap.
 */
const MEMORY_LIMIT = '2GB';

/** The catalog name a store is attached under. */
export const STORE = 'store';

export interface GtfsOptions {
  /**
   * Path to a DuckDB file for tables that outlive the run, attached as `store`.
   * Omitted means everything is in-memory, which is what the steps that only
   * read the feed want.
   */
  store?: string;
}

export interface Gtfs {
  /** Rows as plain JSON values — no BigInt, no DuckDB wrappers to unwrap at the call site. */
  query<Row>(sql: string): Promise<Row[]>;
  /** For a statement with nothing to read back — `create table`, `insert`, `attach`. */
  run(sql: string): Promise<void>;
  close(): void;
}

/** Single-quoted SQL literal. DuckDB does not treat a backslash as an escape here. */
export function literal(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/**
 * `read_csv` is given the options explicitly rather than left to sniff: the
 * sniffer samples the head of the file, and a column that is empty for the first
 * few thousand rows and populated later would be typed from the sample and
 * silently truncate.
 */
function view(gtfsDir: string, file: GtfsFile): string {
  return `create view ${file} as select * from read_csv(
    ${literal(join(gtfsDir, `${file}.txt`))},
    header = true,
    all_varchar = true,
    strict_mode = false
  )`;
}

/**
 * Fails up front on a missing member instead of at the first query that touches
 * it, so a partially extracted feed is reported as such rather than as a SQL
 * error halfway through a report.
 */
async function assertPresent(gtfsDir: string, files: readonly GtfsFile[]): Promise<void> {
  const missing: string[] = [];

  await Promise.all(
    files.map(async file => {
      const path = join(gtfsDir, `${file}.txt`);
      const found = await stat(path).catch(() => null);

      if (!found?.isFile()) {
        missing.push(`${file}.txt`);
      }
    }),
  );

  if (missing.length > 0) {
    throw new Error(
      `${gtfsDir} is missing ${missing.sort().join(', ')}; delete the feed directory and rerun`,
    );
  }
}

/**
 * The buffer pool is only pinned when there is a store, because that is the only
 * path that handles a file measured in gigabytes. The feed-reading steps scan
 * tens of thousands of rows and were merged without a limit; giving them one now
 * would be a behaviour change they did not ask for.
 *
 * `temp_directory` is what makes the limit survivable rather than fatal: an
 * in-memory DuckDB has nowhere to spill until it is told where, and refuses the
 * query instead. It sits beside the store, inside the gitignored feed directory.
 */
function settings(store: string | undefined): Record<string, string> {
  return store === undefined
    ? {}
    : { memory_limit: MEMORY_LIMIT, temp_directory: `${store}.tmp` };
}

export async function openGtfs(
  gtfsDir: string,
  files: readonly GtfsFile[],
  options: GtfsOptions = {},
): Promise<Gtfs> {
  await assertPresent(gtfsDir, files);

  // In-memory: the views are scaffolding over the CSVs and nothing is gained by
  // writing them down. What a step wants to keep goes into the attached store.
  const instance = await DuckDBInstance.create(':memory:', settings(options.store));
  const connection: DuckDBConnection = await instance.connect();

  try {
    for (const file of files) {
      // Sequential because `create view` is instant and a Promise.all here would
      // only add interleaving to something with no wait in it.
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      await connection.run(view(gtfsDir, file));
    }

    if (options.store !== undefined) {
      await connection.run(`attach ${literal(options.store)} as ${STORE}`);
    }
  } catch (error) {
    connection.closeSync();
    instance.closeSync();
    throw new Error(`${gtfsDir} could not be opened as GTFS`, { cause: error });
  }

  return {
    async query<Row>(sql: string): Promise<Row[]> {
      const reader = await connection.runAndReadAll(sql);
      return reader.getRowObjectsJson() as Row[];
    },
    async run(sql: string): Promise<void> {
      await connection.run(sql);
    },
    close(): void {
      connection.closeSync();
      instance.closeSync();
    },
  };
}
