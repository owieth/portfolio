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
import { expandCalendar } from './calendar.ts';
import { emitArtifacts } from './emit.ts';
import { fetchFeed } from './fetch.ts';
import { FETCH_FLAGS, parseFetchOptions } from './fetch/options.ts';
import type { FetchOptions, FlagValue } from './fetch/options.ts';
import { ingestStopTimes } from './ingest.ts';
import { INGEST_FLAGS, parseIngestOptions } from './ingest/options.ts';
import { matchLines } from './match.ts';
import { mergeLines } from './merge.ts';
import { nameLines } from './naming.ts';
import { loadOperators } from './naming/operators.ts';
import { fetchOsmRelations } from './overpass.ts';
import { derivePatterns } from './patterns.ts';
import { recon } from './recon.ts';
import { assignRegions } from './regions.ts';
import { flagSeasonal } from './seasonal.ts';
import { seedLines } from './seed.ts';
import { loadFunicularSeed } from './seed/funiculars.ts';
import { sequenceLines } from './sequence.ts';
import { resolveStations } from './stations.ts';
import { findTermini } from './termini.ts';

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
  // The remaining step lands as its own module here and is called from this
  // function, last: the report.
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
    // After the ingest by necessity rather than for the log: both write into
    // rail.duckdb, and a DuckDB file takes one writer at a time.
    // react-doctor-disable-next-line react-doctor/server-sequential-independent-await
    const calendar = await expandCalendar(feed.dir, log);
    // After both, because it joins the stop times against the service days.
    const patterns = await derivePatterns(feed.dir, log, {
      routeIds: allowed.routes.map(route => route.routeId),
      didoks: resolved.stations.map(station => station.didok),
    });
    // Reads the stop times table the ingest wrote, through the same one-writer
    // DuckDB file the two steps above hold in turn.
    // react-doctor-disable-next-line react-doctor/server-sequential-independent-await
    const regioned = await assignRegions(feed.dir, allowed.routes, log);
    const merged = mergeLines(regioned.routes, patterns.patterns, log);
    const operators = await loadOperators();
    const named = nameLines(
      {
        lines: merged.lines,
        routes: regioned.routes,
        patterns: patterns.patterns,
        stations: resolved.stations,
        operators,
      },
      log,
    );
    const seeded = seedLines(named.lines, await loadFunicularSeed(), log);
    const sequenced = sequenceLines(
      { lines: seeded.lines, patterns: patterns.patterns, stations: resolved.stations },
      log,
    );
    // Back into rail.duckdb for the service days the calendar step wrote.
    const seasonal = await flagSeasonal(
      feed.dir,
      {
        lines: sequenced.lines,
        window: calendar.window,
        referenceWeek: calendar.referenceWeek,
      },
      log,
    );
    // Late, although it reads nothing the steps above wrote: the match step it
    // feeds needs their lines, and a cold cache here waits minutes on Overpass,
    // which is better spent after the feed has been shown to build.
    // react-doctor-disable-next-line react-doctor/server-sequential-independent-await
    const osm = await fetchOsmRelations(log);
    const matched = matchLines(
      { lines: seasonal.lines, relations: osm.relations, stations: resolved.stations, operators },
      log,
    );

    // Back into rail.duckdb once more, for the stops the patterns cut at the
    // border, which is where an international line's true termini are.
    const termini = await findTermini(
      feed.dir,
      { lines: matched.lines, stations: resolved.stations },
      log,
    );
    const emitted = await emitArtifacts(
      { lines: termini.lines, stations: resolved.stations, attribution: osm.attribution },
      log,
    );

    log(
      `${emitted.lines} lines written with ${emitted.stops} stops between them — ${named.derived} with derived names and ${seeded.manual} seeded by hand, ${sequenced.branched.length} with branches, ${seasonal.seasonal.length} seasonal, ${termini.international.length} international and ${emitted.features} with geometry, from ${allowed.routes.length} routes in ${regioned.regions.length} regions, ${resolved.stations.length} stations, ${ingested.rows} stop times, ${calendar.serviceDays} service days, ${patterns.patterns.length} stop patterns and ${osm.relations.length} OSM route relations; REPORT.md is not implemented yet`,
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
