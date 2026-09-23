/**
 * Step six: find every distinct stop pattern each route runs.
 *
 * A line is not one list of stops. The S-Bahn that runs to the end of the line
 * every half hour turns back two stations early every other trip, an IR splits
 * in two at a junction, and a mountain railway runs its summit trains only in
 * summer. "Which segments of this line have I ridden" is only answerable later
 * if every one of those shapes survives this step, so none of them is merged
 * away here — `sequence.ts` does that, with all of them in hand.
 *
 * A pattern is a route's ordered list of Swiss stations, and its identity is a
 * hash of that list. It is never a `trip_id` or a `service_id`: both are
 * renumbered at every feed regeneration, and a pattern keyed on either would be
 * a new pattern every few days. Neither is stored anywhere this step writes.
 *
 * The patterns go into the feed's store as `patterns`, rebuilt on every run like
 * `service_days`, and come back in memory for the steps that follow.
 */

import { join, relative } from 'node:path';

import { openGtfs } from './db.ts';
import type { Gtfs } from './db.ts';
import { gtfsPath } from './fetch/record.ts';
import { STORE_FILE } from './ingest.ts';
import { RAIL_DIR } from './paths.ts';
import {
  ALLOWED_TRIPS,
  COLLISIONS,
  FINGERPRINT,
  PATTERNS,
  READ_PATTERNS,
  REQUIRED_COLUMNS,
  STORE_TABLES,
  TABLES,
  UNRESOLVED,
  columns,
  keyTable,
} from './patterns/queries.ts';
import type {
  CollisionRow,
  ColumnRow,
  FingerprintRow,
  PatternFile,
  PatternRow,
  TableRow,
  TripsRow,
  UnresolvedRow,
} from './patterns/queries.ts';

/** How many of the most-branched routes the log names. */
const BRANCHED_SHOWN = 5;

export interface Pattern {
  routeId: string;
  /** Sixteen hex characters of the sha256 of `stations`, space-joined. */
  hash: string;
  /** Didok numbers, in the order the trains serve them. */
  stations: string[];
  /** Trips on this route that serve exactly this list. */
  trips: number;
  /** The same trips weighted by the days each runs in the feed year. */
  runs: number;
}

export interface PatternInput {
  /** The routes the allowlist kept. */
  routeIds: readonly string[];
  /** The stations the stations step decided are Swiss. */
  didoks: readonly string[];
}

export interface Patterns {
  /** Ordered by route and then by hash. */
  patterns: Pattern[];
  /** Routes with at least one pattern. */
  routes: number;
  /** Routes with more than one. */
  branched: number;
  /** Allowed routes with none — no trip of theirs serves two Swiss stations. */
  foreign: number;
  /** Allowed trips that serve fewer than two Swiss stations, so make no pattern. */
  dropped: number;
  /** Stop times on allowed trips whose `stop_id` is not in `stops.txt`. */
  unresolved: number;
  /** One hash over every stored row, to compare two runs by. */
  fingerprint: string;
  elapsedMs: number;
}

type Log = (message: string) => void;

function count(value: number): string {
  return value.toLocaleString('en-US');
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function here(path: string): string {
  return relative(RAIL_DIR, path);
}

async function assertColumns(db: Gtfs): Promise<void> {
  const files = Object.keys(REQUIRED_COLUMNS) as PatternFile[];

  const missing = await Promise.all(
    files.map(async file => {
      const present = new Set(
        (await db.query<ColumnRow>(columns(file))).map(row => row.column_name),
      );
      const absent = REQUIRED_COLUMNS[file].filter(column => !present.has(column));
      return absent.length === 0 ? null : `${file}.txt is missing ${absent.join(', ')}`;
    }),
  );

  const sentences = missing.filter(sentence => sentence !== null);

  if (sentences.length > 0) {
    throw new Error(
      `${sentences.join('; ')}; rerun pnpm recon:data to see what the feed does carry`,
    );
  }
}

/**
 * The step reads what the ingest and calendar steps wrote, and a store without
 * one of their tables is a build run out of order, which deserves to be told so
 * rather than meet a catalog error.
 */
async function assertStore(db: Gtfs, store: string): Promise<void> {
  const present = new Set((await db.query<TableRow>(TABLES)).map(row => row.table_name));
  const missing = STORE_TABLES.filter(table => !present.has(table));

  if (missing.length > 0) {
    throw new Error(
      `${here(store)} has no ${missing.join(' or ')} table; the ingest and calendar steps write them and have to run first`,
    );
  }
}

function toPattern(row: PatternRow): Pattern {
  return {
    routeId: row.route_id,
    hash: row.pattern_hash,
    stations: row.stations,
    trips: row.trips,
    runs: row.runs,
  };
}

/**
 * Busiest first, then by route: the log is read against the previous run's log,
 * and a tie resolved by insertion order would be noise between the two.
 */
function patternCounts(patterns: readonly Pattern[]): [string, number][] {
  const counts = new Map<string, number>();

  for (const pattern of patterns) {
    counts.set(pattern.routeId, (counts.get(pattern.routeId) ?? 0) + 1);
  }

  return [...counts.entries()].sort(([a, x], [b, y]) => y - x || a.localeCompare(b));
}

export async function derivePatterns(
  feedDir: string,
  log: Log,
  input: PatternInput,
): Promise<Patterns> {
  const store = join(feedDir, STORE_FILE);
  const db = await openGtfs(gtfsPath(feedDir), ['stops', 'trips'], { store });

  try {
    await Promise.all([assertColumns(db), assertStore(db, store)]);

    await db.run(keyTable('allowed', 'route_id', input.routeIds));
    await db.run(keyTable('swiss', 'didok', input.didoks));

    const startedAt = performance.now();

    await db.run(PATTERNS);

    // Sequential: each is a scan of the store, and DuckDB already parallelises
    // inside a query — two at once would only compete for the buffer pool.
    const patterns = (await db.query<PatternRow>(READ_PATTERNS)).map(toPattern);
    const collisions = await db.query<CollisionRow>(COLLISIONS);
    const [allowed] = await db.query<TripsRow>(ALLOWED_TRIPS);
    const [unresolvedRow] = await db.query<UnresolvedRow>(UNRESOLVED);
    const [fingerprintRow] = await db.query<FingerprintRow>(FINGERPRINT);

    const elapsedMs = performance.now() - startedAt;

    if (patterns.length === 0) {
      throw new Error(
        `no stop patterns came out of ${count(allowed?.trips ?? 0)} allowed trips; the stop times, the stations and the allowlist no longer describe the same feed — delete the feed directory and rerun`,
      );
    }

    // Two station lists under one hash would merge two patterns into one without
    // a trace. At 64 bits it should never happen; if it does, the hash has to
    // grow, and the build has to stop until it has.
    if (collisions.length > 0) {
      throw new Error(
        `pattern hashes ${collisions.map(row => row.pattern_hash).join(', ')} each stand for more than one station list; lengthen the hash in patterns/queries.ts`,
      );
    }

    const perRoute = patternCounts(patterns);
    const branched = perRoute.filter(([, patternCount]) => patternCount > 1);
    const trips = patterns.reduce((sum, pattern) => sum + pattern.trips, 0);
    const dropped = (allowed?.trips ?? 0) - trips;
    const foreign = new Set(input.routeIds).size - perRoute.length;
    const unresolved = unresolvedRow?.stops ?? 0;
    const fingerprint = fingerprintRow?.fingerprint ?? '';

    log(
      `${count(patterns.length)} stop patterns over ${count(perRoute.length)} routes and ${count(trips)} trips into ${here(store)} — ${seconds(elapsedMs)}, fingerprint ${fingerprint}`,
    );

    if (branched.length > 0) {
      log(
        `${count(branched.length)} routes run more than one pattern; most: ${branched
          .slice(0, BRANCHED_SHOWN)
          .map(([routeId, patternCount]) => `${routeId} ${count(patternCount)}`)
          .join(', ')}`,
      );
    }

    // Expected, not an error: a TGV that crosses the border at its first stop, or
    // a trip that serves one Swiss station and runs straight through the rest,
    // has no Swiss segment to ride. Counted because a jump in it is how a broken
    // station join would show up.
    if (dropped > 0) {
      log(`${count(dropped)} allowed trips serve fewer than two Swiss stations and make no pattern`);
    }

    // The geographic cut the allowlist could not make from routes.txt: a DB Regio
    // RE or a TGV that is in the Swiss feed because it reaches a border station,
    // and never serves two Swiss stations in a row, is not a Swiss line to ride.
    if (foreign > 0) {
      log(
        `${count(foreign)} allowed routes make no pattern, because none of their trips serves two Swiss stations`,
      );
    }

    if (unresolved > 0) {
      log(
        `${count(unresolved)} stop times on allowed trips name a stop_id that stops.txt does not have; those stops are missing from their patterns`,
      );
    }

    return {
      patterns,
      routes: perRoute.length,
      branched: branched.length,
      foreign,
      dropped,
      unresolved,
      fingerprint,
      elapsedMs,
    };
  } finally {
    db.close();
  }
}
