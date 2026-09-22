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
 *   pnpm diff:data
 */

import { parseArgs } from 'node:util';

import { RAW_DIR } from './paths.ts';

const COMMANDS = ['build', 'diff'] as const;

type Command = (typeof COMMANDS)[number];

const USAGE = `usage: pnpm build:data | pnpm diff:data

  build   regenerate lines.csv, line_stops.csv, lines.json, lines.geojson and REPORT.md
  diff    compare the generated artifacts against the committed ones`;

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

function build(): number {
  // Each step lands as its own module here and is called from this function, in
  // order: fetch, allowlist, stations, ingest, calendar, patterns, regions,
  // merge, naming, sequence, seasonal, overpass, match, emit, report.
  log('no pipeline steps are implemented yet; nothing to do');
  log(`the feed and the Overpass responses will be cached in ${RAW_DIR}`);
  return 0;
}

function diff(): number {
  log('no artifacts to diff yet; nothing to do');
  return 0;
}

/**
 * Returns the exit code instead of calling `process.exit`, so a test can assert
 * on it without catching a thrown exit.
 */
export function main(argv: string[]): number {
  // Permissive on options on purpose: the flags arrive with the steps that read
  // them (`--year` and `--source` in the fetch step), and rejecting them here
  // first would mean editing this function to add each one.
  const { positionals } = parseArgs({
    args: argv,
    strict: false,
    allowPositionals: true,
  });

  const [command] = positionals;

  if (!isCommand(command)) {
    process.stderr.write(`${USAGE}\n`);
    return 1;
  }

  return command === 'build' ? build() : diff();
}

// Guarded so a test can import `main` without the module running a pipeline as
// a side effect of being loaded.
if (process.argv[1] === import.meta.filename) {
  process.exitCode = main(process.argv.slice(2));
}
