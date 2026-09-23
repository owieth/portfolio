/**
 * The flags and the one environment variable the reconcile reads.
 *
 * Parsing lives here rather than in `cli.ts` for the reason `fetch/options.ts`
 * gives: `cli.ts` runs `parseArgs` in permissive mode, and the step that reads a
 * flag is the step that validates it.
 */

import { resolve } from 'node:path';

import { single } from '../fetch/options.ts';
import type { FlagValue } from '../fetch/options.ts';
import { RAIL_DIR } from '../paths.ts';

/**
 * Declared for `parseArgs` so `--dir <path>` consumes its value and `--apply`
 * reads as a flag. `cli.ts` only spreads it in.
 */
export const RECONCILE_FLAGS = {
  apply: { type: 'boolean' },
  dir: { type: 'string' },
} as const;

export interface ReconcileOptions {
  /** Write the plan. Without it the reconcile is a dry run and writes nothing. */
  apply: boolean;
  /** Where `lines.csv` and `line_stops.csv` are. The top of `rail/` by default. */
  dir: string;
  databaseUrl: string;
}

export type ParsedReconcileOptions =
  { ok: true; value: ReconcileOptions } | { ok: false; error: string };

const POSTGRES_URL = /^postgres(ql)?:\/\//;

export function parseReconcileOptions(
  values: Record<string, FlagValue>,
  env: Record<string, string | undefined> = process.env,
): ParsedReconcileOptions {
  // A value here would be `--apply=no`, which should not read as yes.
  if (values.apply !== undefined && values.apply !== true) {
    return { ok: false, error: '--apply takes no value' };
  }

  const dir = single('dir', values.dir);

  if (!dir.ok) {
    return dir;
  }

  const databaseUrl = env.DATABASE_URL ?? '';

  if (databaseUrl === '') {
    return {
      ok: false,
      error:
        "DATABASE_URL is not set; put the project's session pooler connection string in .env.local",
    };
  }

  if (!POSTGRES_URL.test(databaseUrl)) {
    return { ok: false, error: 'DATABASE_URL is not a postgresql:// connection string' };
  }

  return {
    ok: true,
    value: {
      apply: values.apply === true,
      dir: dir.value === null ? RAIL_DIR : resolve(dir.value),
      databaseUrl,
    },
  };
}
