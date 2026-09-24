/**
 * Filesystem anchors shared by every pipeline step.
 *
 * The distinction they encode is the one thing every step needs and no step
 * should decide for itself: `data/` holds committed lookups and seed files that
 * a human wrote and reviews, `data/raw/` holds the download cache that the
 * pipeline writes, gitignores, and may delete at any time.
 *
 * Resolved from this file's own URL rather than from `process.cwd()`, so the
 * paths are the same whether the command was started from the repo root, from
 * `rail/`, or from an editor.
 */

import { fileURLToPath } from 'node:url';

export const RAIL_DIR = fileURLToPath(new URL('../', import.meta.url));

/** Committed lookups and seeds — the region rules and the funicular seed file. */
export const DATA_DIR = fileURLToPath(new URL('../data/', import.meta.url));

/** Download and Overpass cache. Gitignored, safe to delete, slow to refill. */
export const RAW_DIR = fileURLToPath(new URL('../data/raw/', import.meta.url));

/** Served by Next.js as-is: what the browser downloads, outside the JS bundle. */
export const PUBLIC_RAIL_DIR = fileURLToPath(new URL('../../public/rail/', import.meta.url));
