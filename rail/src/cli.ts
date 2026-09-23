/**
 * Regenerates every committed artifact in this directory — `lines.csv`,
 * `line_stops.csv`, `lines.json`, `lines.geojson` and `REPORT.md` — from the
 * published Swiss timetable feed and OpenStreetMap geometry.
 *
 * The step order lives here rather than in a build tool because the steps share
 * one DuckDB connection and a lot of intermediate state, which file-level build
 * targets would have to serialise to disk for no benefit.
 *
 * Rerun it each December, a few days after the new feed goes live, then read the
 * diff and `REPORT.md` before committing. It never writes to Supabase; that is a
 * deliberate second step.
 *
 *   pnpm build:data
 *   pnpm build:data --year 2027
 *   pnpm build:data --source geops
 *   pnpm build:data --force
 *   pnpm diff:data
 *   pnpm recon:data
 *
 * Exit codes: 0 done, 1 the command line was wrong, 2 a step failed.
 */

import { parseArgs } from 'node:util';

import { allowRoutes } from './allowlist.ts';
import { fetchFeed } from './fetch.ts';
import { FETCH_FLAGS, parseFetchOptions } from './fetch/options.ts';
import type { FetchOptions, FlagValue } from './fetch/options.ts';
import { ingestStopTimes } from './ingest.ts';
import { INGEST_FLAGS, parseIngestOptions } from './ingest/options.ts';
import { recon } from './recon.ts';
import { assignRegions } from './regions.ts';
import { resolveStations } from './stations.ts';

const COMMANDS = ['build', 'diff', 'recon'] as const;

type Command = (typeof COMMANDS)[number];

const USAGE = `usage: pnpm build:data [--year <year>] [--source opentransportdata|geops] [--force]
       pnpm diff:data
       pnpm recon:data [--year <year>] [--source opentransportdata|geops]

  build   regenerate lines.csv, line_stops.csv, lines.json, lines.geojson and REPORT.md
  diff    compare the generated artifacts against the committed ones
  recon   profile the feed into RECON.md, before anything models it

  --year    timetable year to build; defaults to the one in force today
  --source  where to get the feed; the geops mirror is opt-in, never automatic
  --force   re-read stop_times.txt even when the feed's store already answers for it`;

/**
 * Progress goes to stderr so stdout stays clean for an artifact that a future
 * caller might want to pipe.
 */
function log(message: string): void {
  process.stderr.write(`rail: ${message}\n`);
}

function isCommand(value: string | undefined): value is Command {
  return COMMANDS.includes(value as Command);
}

/**
 * Both feed-reading commands take the same flags and fail the same two ways, so
 * the parse and the error handling live here once rather than in each of them.
 */
async function withFeedOptions(
  values: Record<string, FlagValue>,
  run: (options: FetchOptions) => Promise<void>,
): Promise<number> {
  const options = parseFetchOptions(values);

  if (!options.ok) {
    log(options.error);
    process.stderr.write(`${USAGE}\n`);
    return 1;
  }

  try {
    await run(options.value);
  } catch (error) {
    log(error instanceof Error ? error.message : String(error));

    if (error instanceof Error && error.cause !== undefined) {
      log(`  caused by: ${error.cause}`);
    }

    return 2;
  }

  return 0;
}

function build(values: Record<string, FlagValue>): Promise<number> {
  // The remaining steps land as their own modules here and are called from this
  // function, in order: calendar, patterns, merge, naming, sequence, seasonal,
  // overpass, match, emit, report.
  return withFeedOptions(values, async options => {
    const feed = await fetchFeed(options, log);
    const allowed = await allowRoutes(feed.gtfsDir, log);

    // Sequential although the first three steps do not depend on each other yet.
    // Each one narrates itself to stderr and the log is read top to bottom, so
    // running them together would interleave three reports into none. The first
    // two read 5,170 and 104,262 rows; the third reads several gigabytes and is
    // the one thing here that would rather have the memory to itself.
    // react-doctor-disable-next-line react-doctor/server-sequential-independent-await
    const resolved = await resolveStations(feed.gtfsDir, log);
    const ingested = await ingestStopTimes(feed.dir, log, parseIngestOptions(values));
    // Depends on the ingest through the disk: it reads the stop times table the
    // previous line wrote into the feed's store.
    // react-doctor-disable-next-line react-doctor/server-sequential-independent-await
    const regioned = await assignRegions(feed.dir, allowed.routes, log);

    log(
      `${allowed.routes.length} routes in ${regioned.regions.length} regions, ${resolved.stations.length} stations and ${ingested.rows} stop times are ready; no further steps are implemented yet`,
    );
  });
}

function profile(values: Record<string, FlagValue>): Promise<number> {
  return withFeedOptions(values, async options => {
    await recon(options, log);
  });
}

function diff(): number {
  log('no artifacts to diff yet; nothing to do');
  return 0;
}

/**
 * Returns the exit code instead of calling `process.exit`, so a test can assert
 * on it without catching a thrown exit.
 */
export async function main(argv: string[]): Promise<number> {
  // Permissive on purpose: an unknown flag is accepted rather than rejected here,
  // because the steps own their flags. Each step exports its declarations so its
  // values are consumed correctly, and validates them itself.
  const { positionals, values } = parseArgs({
    args: argv,
    options: { ...FETCH_FLAGS, ...INGEST_FLAGS },
    strict: false,
    allowPositionals: true,
  });

  const [command] = positionals;

  if (!isCommand(command)) {
    process.stderr.write(`${USAGE}\n`);
    return 1;
  }

  if (command === 'diff') {
    return diff();
  }

  return command === 'build' ? build(values) : profile(values);
}

// Guarded so a test can import `main` without the module running a pipeline as
// a side effect of being loaded.
if (process.argv[1] === import.meta.filename) {
  process.exitCode = await main(process.argv.slice(2));
}
