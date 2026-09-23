/**
 * `pnpm seed:data`: write `supabase/seeds/rail.sql` from the committed
 * `lines.csv` and `line_stops.csv`.
 *
 * Not a build step, and it never talks to a database. `supabase db reset` runs
 * the file it writes locally, and `supabase db push --include-seed` runs it
 * against the project. Rerun it after a build rewrites the CSVs; the test that
 * compares the committed seed with the committed CSVs fails until it has been.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderSeed } from './dbseed/sql.ts';
import { parseCsv } from './diff/csv.ts';
import { LINE_STOPS_CSV, LINES_CSV } from './emit.ts';
import { RAIL_DIR } from './paths.ts';

/** Where `supabase/config.toml`'s `[db.seed]` looks for it. */
export const SEED_SQL = fileURLToPath(
  new URL('../../supabase/seeds/rail.sql', import.meta.url),
);

export interface SeedPaths {
  /** Where the CSVs are. The top of `rail/` unless a test says otherwise. */
  dir?: string;
  out?: string;
}

export interface Seeded {
  lines: number;
  stops: number;
  sql: string;
}

type Log = (message: string) => void;

export async function renderSeedFrom(dir: string = RAIL_DIR): Promise<Seeded> {
  const [lines, stops] = await Promise.all(
    [LINES_CSV, LINE_STOPS_CSV].map(async file =>
      parseCsv(await readFile(join(dir, file), 'utf8')),
    ),
  );

  return { lines: lines.length, stops: stops.length, sql: renderSeed(lines, stops) };
}

export async function writeSeed(
  log: Log,
  { dir = RAIL_DIR, out = SEED_SQL }: SeedPaths = {},
): Promise<Seeded> {
  const seeded = await renderSeedFrom(dir);

  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, seeded.sql, 'utf8');

  log(
    `wrote ${seeded.lines.toLocaleString('en-US')} lines and ${seeded.stops.toLocaleString('en-US')} line stops to ${out}`,
  );

  return seeded;
}
