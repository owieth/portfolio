/**
 * `pnpm diff:data`: what a build changed in `lines.csv` and `line_stops.csv`.
 *
 * Not a build step. The build rewrites the artifacts in place, so the committed
 * snapshot it replaced is still in git, and this reads it back from there — at
 * `HEAD` unless `--base` names another ref — and compares it with the files on
 * disk. Nothing is copied aside before a build, so the diff can be rerun after
 * any build, or between any two commits' worth of artifacts.
 *
 * It only reads. The reconcile in #488 is what acts on a change, and it stays a
 * deliberate second step.
 */

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { compareSnapshots, isUnchanged, snapshotOf } from './diff/compare.ts';
import type { Comparison } from './diff/compare.ts';
import { parseCsv } from './diff/csv.ts';
import type { DiffOptions } from './diff/options.ts';
import { renderDiff } from './diff/render.ts';
import { LINE_STOPS_CSV, LINES_CSV } from './emit.ts';
import { RAIL_DIR } from './paths.ts';

const run = promisify(execFile);

/** `line_stops.csv` is well under this; git's output is buffered whole. */
const MAX_BUFFER = 64 * 1024 * 1024;

export interface DiffDirOptions {
  /** Where the artifacts are. The top of `rail/` unless a test says otherwise. */
  dir?: string;
}

export interface Diffed {
  comparison: Comparison;
  markdown: string;
}

type Log = (message: string) => void;

async function git(dir: string, args: string[]): Promise<string> {
  const { stdout } = await run('git', args, { cwd: dir, maxBuffer: MAX_BUFFER });

  return stdout;
}

async function resolveCommit(dir: string, base: string): Promise<string> {
  try {
    return (await git(dir, ['rev-parse', '--verify', '--quiet', `${base}^{commit}`])).trim();
  } catch (error) {
    throw new Error(`--base ${base} does not name a commit`, { cause: error });
  }
}

/**
 * A file the commit does not have reads as empty, so the first diff after the
 * artifacts are added lists every line as new rather than failing.
 */
async function committed(dir: string, commit: string, file: string): Promise<string> {
  const listed = await git(dir, ['ls-tree', '--name-only', commit, '--', file]);

  return listed.trim() === '' ? '' : git(dir, ['show', `${commit}:./${file}`]);
}

async function generated(dir: string, file: string): Promise<string> {
  try {
    return await readFile(join(dir, file), 'utf8');
  } catch (error) {
    throw new Error(`${file} is missing; run pnpm build:data first`, { cause: error });
  }
}

function plural(value: number, noun: string): string {
  return `${value.toLocaleString('en-US')} ${value === 1 ? noun : `${noun}s`}`;
}

export async function diffArtifacts(
  { base }: DiffOptions,
  log: Log,
  { dir = RAIL_DIR }: DiffDirOptions = {},
): Promise<Diffed> {
  const commit = await resolveCommit(dir, base);
  const read = async (side: (file: string) => Promise<string>) => {
    // One after the other, so a build that wrote neither always reports the
    // same missing file rather than whichever read lost the race.
    const lines = await side(LINES_CSV);
    // react-doctor-disable-next-line react-doctor/server-sequential-independent-await
    const stops = await side(LINE_STOPS_CSV);

    return snapshotOf(parseCsv(lines), parseCsv(stops));
  };
  const [before, after] = await Promise.all([
    read(file => committed(dir, commit, file)),
    read(file => generated(dir, file)),
  ]);
  const comparison = compareSnapshots(before, after);

  log(
    isUnchanged(comparison)
      ? `diffed ${LINES_CSV} and ${LINE_STOPS_CSV} against ${base}: no line or stop changed`
      : `diffed ${LINES_CSV} and ${LINE_STOPS_CSV} against ${base}: ${plural(comparison.added.length, 'line')} added, ${comparison.removed.length.toLocaleString('en-US')} removed, ${comparison.renumbered.length.toLocaleString('en-US')} likely renumbered, ${comparison.renamed.length.toLocaleString('en-US')} renamed and ${plural(comparison.stopChanges.length, 'line')} with other stations`,
  );

  return { comparison, markdown: renderDiff(comparison, { base }) };
}
