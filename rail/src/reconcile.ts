/**
 * `pnpm reconcile:data`: bring `rail_lines` and `rail_line_stops` in line with
 * the committed `lines.csv` and `line_stops.csv` without undoing anything that
 * was edited by hand.
 *
 * Not a build step, and the only command here that writes to Supabase. The
 * build and the diff only read the feed and git; this is the deliberate second
 * step the December runbook ends with. It is a dry run unless `--apply` is
 * given: it reads the tables, plans the refresh and prints the plan. With
 * `--apply` it plans again inside the transaction that writes, and prints what
 * it wrote. See `reconcile/plan.ts` for what the plan does to each row.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parseCsv } from './diff/csv.ts';
import { LINE_STOPS_CSV, LINES_CSV } from './emit.ts';
import { applyReconcile, connect, readState } from './reconcile/db.ts';
import type { ReconcileOptions } from './reconcile/options.ts';
import { planReconcile } from './reconcile/plan.ts';
import type { Plan, TablePlan } from './reconcile/plan.ts';
import { renderReconcile } from './reconcile/render.ts';
import { feedOf } from './reconcile/rows.ts';
import type { Feed } from './reconcile/rows.ts';

export interface Reconciled {
  plan: Plan;
  markdown: string;
}

type Log = (message: string) => void;

async function csv(dir: string, file: string) {
  try {
    return parseCsv(await readFile(join(dir, file), 'utf8'));
  } catch (error) {
    throw new Error(`cannot read ${join(dir, file)}`, { cause: error });
  }
}

export async function readFeed(dir: string): Promise<Feed> {
  return feedOf(await csv(dir, LINES_CSV), await csv(dir, LINE_STOPS_CSV));
}

function summary(plan: TablePlan<unknown>): string {
  return [
    `${plan.inserts.length} inserted`,
    `${plan.updates.length} updated`,
    `${plan.flagged.length} flagged missing`,
    `${plan.restored.length} restored`,
    `${plan.skipped.length} skipped because edited`,
  ].join(', ');
}

export async function reconcileFeed(
  { apply, dir, databaseUrl }: ReconcileOptions,
  log: Log,
): Promise<Reconciled> {
  const feed = await readFeed(dir);
  const sql = connect(databaseUrl);

  let plan: Plan;

  try {
    plan = apply
      ? await applyReconcile(sql, feed)
      : planReconcile(feed, await readState(sql));
  } finally {
    await sql.end();
  }

  log(
    `${apply ? 'reconciled' : 'planned, without writing,'} ${feed.lines.length.toLocaleString('en-US')} lines — lines: ${summary(plan.lines)}; line stops: ${summary(plan.stops)}`,
  );

  return { plan, markdown: renderReconcile(plan, { applied: apply }) };
}
