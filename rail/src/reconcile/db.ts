/**
 * The reconcile's side of Postgres: read what the tables hold, and write a plan
 * into them in one transaction.
 *
 * Straight to Postgres rather than through the Supabase API, for two things the
 * API cannot do from outside: run every write in one transaction, so a failed
 * refresh leaves the tables as they were, and `set local` inside it, which is
 * how the `rail_track_edits` trigger tells the reconcile's writes from a
 * person's. The connection string is the project's, from `DATABASE_URL`, and
 * never leaves the laptop that runs the refresh.
 *
 * Writes are inserts and updates only. A row the feed no longer has is flagged
 * with `missing_since`, not removed.
 */

import postgres from 'postgres';
import type { PendingQuery, Row, Sql, TransactionSql } from 'postgres';

import { planReconcile } from './plan.ts';
import type { Key, Plan, TablePlan } from './plan.ts';
import { LINE_FIELDS, STOP_FIELDS } from './rows.ts';
import type { DbLine, DbStop, Feed, State } from './rows.ts';

type Query = Sql | TransactionSql;

/**
 * Rows per insert statement. Postgres takes at most 65,535 parameters in one,
 * and a stop row has nine.
 */
const BATCH = 1_000;

export function connect(url: string): Sql {
  // One connection, since a transaction runs on one anyway. Unprepared, so the
  // same code works through Supabase's transaction pooler, which does not keep
  // prepared statements between transactions.
  return postgres(url, { max: 1, prepare: false, onnotice: () => {} });
}

export async function readState(sql: Query): Promise<State> {
  // `missing_since` as text, which is how the plan compares it, rather than a
  // `Date` at midnight in the laptop's time zone.
  const [lines, stops] = await Promise.all([
    sql<DbLine[]>`
      select ${sql(['id', ...LINE_FIELDS, 'edited_fields'])}, missing_since::text as missing_since
      from public.rail_lines
    `,
    sql<DbStop[]>`
      select ${sql(['line_id', 'sequence', ...STOP_FIELDS, 'edited_fields'])}, missing_since::text as missing_since
      from public.rail_line_stops
    `,
  ]);

  return { lines: [...lines], stops: [...stops] };
}

interface Destination {
  name: string;
  columns: readonly string[];
  where: (sql: TransactionSql, key: Key) => PendingQuery<Row[]>;
}

const RAIL_LINES: Destination = {
  name: 'public.rail_lines',
  columns: ['id', ...LINE_FIELDS],
  where: (sql, key) => sql`id = ${key.id}`,
};

const RAIL_LINE_STOPS: Destination = {
  name: 'public.rail_line_stops',
  columns: ['line_id', 'sequence', ...STOP_FIELDS],
  where: (sql, key) => sql`line_id = ${key.line_id} and sequence = ${key.sequence}`,
};

async function write<Planned>(
  sql: TransactionSql,
  table: Destination,
  plan: TablePlan<Planned>,
): Promise<void> {
  const batches: Row[][] = [];

  for (let start = 0; start < plan.inserts.length; start += BATCH) {
    batches.push(plan.inserts.slice(start, start + BATCH) as Row[]);
  }

  // Sent together rather than one round trip each: the connection pipelines
  // them, and the transaction around them still fails as one if any does. No
  // two of them touch the same row except a restore and an update, in either
  // order.
  await Promise.all([
    ...batches.map(
      rows => sql`insert into ${sql(table.name)} ${sql(rows, table.columns)}`,
    ),
    ...plan.updates.map(
      update =>
        sql`update ${sql(table.name)} set ${sql(update.set as Row)} where ${table.where(sql, update.key)}`,
    ),
    ...plan.flagged.map(
      target =>
        sql`update ${sql(table.name)} set missing_since = current_date where ${table.where(sql, target.key)}`,
    ),
    ...plan.restored.map(
      target =>
        sql`update ${sql(table.name)} set missing_since = null where ${table.where(sql, target.key)}`,
    ),
  ]);
}

/**
 * Plans against the tables as they are inside the transaction and writes that
 * plan, so nothing can change between the read and the writes. The lock lets
 * readers carry on and makes any other writer wait until this commits.
 */
export async function applyPlan(sql: TransactionSql, feed: Feed): Promise<Plan> {
  await sql`set local rail.reconciling = 'on'`;
  await sql`lock table public.rail_lines, public.rail_line_stops in share row exclusive mode`;

  const plan = planReconcile(feed, await readState(sql));

  // The lines first: a new stop references its line.
  await write(sql, RAIL_LINES, plan.lines);
  await write(sql, RAIL_LINE_STOPS, plan.stops);

  return plan;
}

export async function applyReconcile(sql: Sql, feed: Feed): Promise<Plan> {
  return sql.begin(tx => applyPlan(tx, feed));
}
