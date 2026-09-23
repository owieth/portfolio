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
  | 'routes'
  | 'stop_times'
  | 'stops'
  | 'trips';

export interface Gtfs {
  /** Rows as plain JSON values — no BigInt, no DuckDB wrappers to unwrap at the call site. */
  query<Row>(sql: string): Promise<Row[]>;
  close(): void;
}

/** Single-quoted SQL literal. DuckDB does not treat a backslash as an escape here. */
function literal(value: string): string {
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

export async function openGtfs(
  gtfsDir: string,
  files: readonly GtfsFile[],
): Promise<Gtfs> {
  await assertPresent(gtfsDir, files);

  // In-memory: nothing here outlives the run, and a database file in data/raw/
  // would be one more multi-gigabyte artifact to explain and clean up.
  const instance = await DuckDBInstance.create(':memory:');
  const connection: DuckDBConnection = await instance.connect();

  try {
    for (const file of files) {
      // Sequential because `create view` is instant and a Promise.all here would
      // only add interleaving to something with no wait in it.
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      await connection.run(view(gtfsDir, file));
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
    close(): void {
      connection.closeSync();
      instance.closeSync();
    },
  };
}
