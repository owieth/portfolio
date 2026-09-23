/**
 * Step four: read `stop_times.txt` once, and keep the five columns a line is
 * made of.
 *
 * It is the largest file in the feed by two orders of magnitude — over 3 GB
 * unpacked, which is why `fetch/extract.ts` streams it member by member — and
 * four later steps need it: the stop patterns, the canonical sequence, and what
 * builds on those. Reading it as a view four times would mean parsing 12 GB of
 * CSV to answer questions about 18 million rows that never change.
 *
 * So this step narrows it and writes the result into a DuckDB file inside the
 * feed's own directory. What comes out is the feed's trips as ordered lists of
 * stops and nothing else: no times, no headsigns, no distances. The table is a
 * cache and not an artifact — it is gitignored, it is deleted along with the
 * feed it came from, and every run checks it still answers for the CSV on disk
 * before trusting it.
 *
 * Takes the feed directory rather than the `gtfsDir` its siblings take, because
 * unlike them it writes as well as reads, and the store belongs beside
 * `gtfs.zip` and `feed.json` rather than inside the unpacked members. A test
 * still hands it a directory it wrote itself; it just puts a `gtfs/` in there.
 */

import { stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { openGtfs } from './db.ts';
import type { Gtfs } from './db.ts';
import { gtfsPath } from './fetch/record.ts';
import {
  COLUMNS,
  COUNT_ROWS,
  INGEST,
  KEPT_COLUMNS,
  LEDGER,
  LEDGER_ROW,
  TOTALS,
  record,
} from './ingest/queries.ts';
import type { ColumnRow, CountRow, LedgerRow, TotalsRow } from './ingest/queries.ts';
import type { IngestOptions } from './ingest/options.ts';
import { RAIL_DIR } from './paths.ts';

/** The DuckDB file this step writes, inside the feed directory it was built from. */
export const STORE_FILE = 'rail.duckdb';

export interface Ingest {
  /** Rows in the stored table. */
  rows: number;
  /** Distinct trips they belong to. */
  trips: number;
  /** True when the stored table already answered for the CSV and was left alone. */
  skipped: boolean;
  elapsedMs: number;
  /**
   * Resident set size at its highest during the load. DuckDB's buffer pool is
   * native allocation inside this process — outside the V8 heap, inside RSS — so
   * this is the whole of what the step costs, and `heapUsed` would report almost
   * none of it.
   */
  peakRssBytes: number;
}

type Log = (message: string) => void;

function count(value: number): string {
  return value.toLocaleString('en-US');
}

function size(bytes: number): string {
  return bytes >= 1_000_000_000
    ? `${(bytes / 1_000_000_000).toFixed(1)} GB`
    : `${(bytes / 1_000_000).toFixed(0)} MB`;
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function here(path: string): string {
  return relative(RAIL_DIR, path);
}

/**
 * Sampled rather than read once at the end, because the peak is the sort, and by
 * the time the query returns DuckDB has already given the memory back. Unref'd so
 * a sampler can never be the reason the process stays alive.
 */
function watchMemory(): () => number {
  let peak = process.memoryUsage.rss();
  const sampler = setInterval(() => {
    peak = Math.max(peak, process.memoryUsage.rss());
  }, 200);
  sampler.unref();

  return () => {
    clearInterval(sampler);
    return Math.max(peak, process.memoryUsage.rss());
  };
}

/**
 * Checked against the file rather than assumed, because the geOps mirror
 * re-derives the feed and a column it does not carry has to arrive as a sentence
 * rather than as a binder error from inside a query that has already spent
 * minutes reading.
 */
async function assertColumns(db: Gtfs): Promise<void> {
  const present = new Set((await db.query<ColumnRow>(COLUMNS)).map(row => row.column_name));
  const missing = KEPT_COLUMNS.filter(column => !present.has(column));

  if (missing.length > 0) {
    throw new Error(
      `stop_times.txt is missing ${missing.join(', ')}; rerun pnpm recon:data to see what the feed does carry`,
    );
  }
}

interface Source {
  bytes: number;
  modified: string;
}

/**
 * Size and modification time rather than a checksum of the contents. `feed.json`
 * already records the sha256 of the archive these bytes came out of, and the
 * only thing re-hashing 3 GB on every later run could catch is someone editing
 * an extracted member by hand.
 */
async function describeSource(path: string): Promise<Source> {
  const found = await stat(path);
  return { bytes: found.size, modified: found.mtime.toISOString() };
}

/**
 * The stored table is reusable only if every part of the question it answers is
 * unchanged: the same bytes on disk, the same columns kept, and a table that
 * still holds the rows the ledger claims. The last one is what catches a table
 * dropped out of band, and it is answered from row-group metadata rather than a
 * scan.
 */
async function stored(
  db: Gtfs,
  source: Source,
  columns: string,
): Promise<LedgerRow | null> {
  const [ledger] = await db.query<LedgerRow>(LEDGER_ROW);

  if (
    ledger === undefined ||
    Number(ledger.bytes) !== source.bytes ||
    ledger.modified !== source.modified ||
    ledger.columns !== columns
  ) {
    return null;
  }

  const [counted] = await db.query<CountRow>(COUNT_ROWS).catch(() => []);

  return counted?.rows === ledger.rows ? ledger : null;
}

export async function ingestStopTimes(
  feedDir: string,
  log: Log,
  options: IngestOptions,
): Promise<Ingest> {
  const gtfsDir = gtfsPath(feedDir);
  const csv = join(gtfsDir, 'stop_times.txt');
  const store = join(feedDir, STORE_FILE);
  const columns = KEPT_COLUMNS.join(',');

  // Opened before the file is measured, not alongside it: `openGtfs` is what
  // turns a missing member into a sentence, and a bare ENOENT from `stat` would
  // get there first.
  const db = await openGtfs(gtfsDir, ['stop_times'], { store });

  try {
    const [source] = await Promise.all([
      describeSource(csv),
      assertColumns(db),
    ]);

    await db.run(LEDGER);

    const ledger = options.force ? null : await stored(db, source, columns);

    if (ledger !== null) {
      log(
        `${count(ledger.rows)} stop times are already ingested from this feed; pass --force to read ${here(csv)} again`,
      );

      return {
        rows: ledger.rows,
        trips: ledger.trips,
        skipped: true,
        elapsedMs: 0,
        peakRssBytes: process.memoryUsage.rss(),
      };
    }

    const startedAt = performance.now();
    const peak = watchMemory();

    await db.run(INGEST);

    const [totals] = await db.query<TotalsRow>(TOTALS);
    const elapsedMs = performance.now() - startedAt;
    const peakRssBytes = peak();
    const { rows, trips } = totals ?? { rows: 0, trips: 0 };

    // An empty stop_times.txt means the extract went wrong, and a ledger row
    // saying "zero rows, up to date" would hand that to four later steps as a
    // fact. Fail here, the way the allowlist and stations steps do.
    if (rows === 0) {
      throw new Error(
        `${here(csv)} yielded no stop times; delete the feed directory and rerun`,
      );
    }

    await db.run(
      record({
        bytes: source.bytes,
        modified: source.modified,
        columns,
        rows,
        trips,
        ingestedAt: new Date().toISOString(),
      }),
    );

    log(
      `${count(rows)} stop times over ${count(trips)} trips into ${here(store)} — ${seconds(elapsedMs)}, peak ${size(peakRssBytes)}`,
    );

    return { rows, trips, skipped: false, elapsedMs, peakRssBytes };
  } finally {
    db.close();
  }
}
