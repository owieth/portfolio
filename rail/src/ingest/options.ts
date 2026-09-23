/**
 * The flag the ingest step reads.
 *
 * Parsing lives here rather than in `cli.ts` for the reason `fetch/options.ts`
 * gives: `cli.ts` runs `parseArgs` in permissive mode, and the step that reads a
 * flag is the step that validates it.
 */

import type { FlagValue } from '../fetch/options.ts';

/**
 * Declared for `parseArgs` so `--force` reads as a boolean rather than swallowing
 * the next word as its value. `cli.ts` only spreads it in.
 */
export const INGEST_FLAGS = {
  force: { type: 'boolean' },
} as const;

export interface IngestOptions {
  /**
   * Re-read the CSV even when the stored table still answers for it. The escape
   * hatch for a changed query, so that reaching for `rm -rf data/raw` — which
   * also throws away a 256 MB download — is never the first thing to try.
   */
  force: boolean;
}

/** A repeated `--force` is still just on; there is no value to disagree about. */
export function parseIngestOptions(values: Record<string, FlagValue>): IngestOptions {
  return { force: values.force !== undefined && values.force !== false };
}
