/**
 * The flag the diff reads.
 *
 * Parsing lives here rather than in `cli.ts` for the reason `fetch/options.ts`
 * gives: `cli.ts` runs `parseArgs` in permissive mode, and the step that reads a
 * flag is the step that validates it.
 */

import { single } from '../fetch/options.ts';
import type { FlagValue } from '../fetch/options.ts';

/**
 * Declared for `parseArgs` so `--base v2026` consumes its value. `cli.ts` only
 * spreads it in.
 */
export const DIFF_FLAGS = {
  base: { type: 'string' },
} as const;

export interface DiffOptions {
  /**
   * The git ref to read the committed files at. `HEAD` by default: the build
   * has just rewritten the working tree, and `HEAD` is what it replaced.
   */
  base: string;
}

export type ParsedDiffOptions =
  | { ok: true; value: DiffOptions }
  | { ok: false; error: string };

export function parseDiffOptions(values: Record<string, FlagValue>): ParsedDiffOptions {
  const base = single('base', values.base);

  if (!base.ok) {
    return base;
  }

  // A leading dash would reach git as an option rather than a ref.
  if (base.value?.startsWith('-')) {
    return { ok: false, error: `--base ${base.value} is not a git ref` };
  }

  return { ok: true, value: { base: base.value ?? 'HEAD' } };
}
