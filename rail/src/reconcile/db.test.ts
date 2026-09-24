import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Sql, TransactionSql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { parseCsv } from '../diff/csv.ts';
import { RAIL_DIR } from '../paths.ts';
import { applyPlan, connect, readState } from './db.ts';
import { IR35, S12, stop } from './fixtures.ts';
import { isEmpty, planReconcile } from './plan.ts';
import { feedOf } from './rows.ts';
import type { Feed } from './rows.ts';

/**
 * Against a real database, because what matters here is what Postgres hands
 * back: whether a `text[]`, a `double precision` and a null read back equal to
 * the feed's values, and whether the trigger records an edit. Opt-in, since CI
 * has no database: point `RAIL_TEST_DATABASE_URL` at a local Supabase after
 * `supabase db reset`, for example
 * `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.
 *
 * Every test runs in a transaction that is rolled back, so the tables are left
 * as the test found them. Each starts by emptying them, inside that
 * transaction, so the seeded rows do not show up in its plan.
 */
const DATABASE_URL = process.env.RAIL_TEST_DATABASE_URL;

class Rollback extends Error {}

const FEED: Feed = {
  lines: [IR35, { ...S12, route_ids: [], seasonal: null, trips_per_week: null }],
  stops: [
    stop(IR35, 1, 'Bern'),
    { ...stop(IR35, 2, 'Luzern'), sloid: 'ch:1:sloid:5000', lat: 47.05017, lon: 8.31018 },
    { ...stop(S12, 1, 'Brugg AG'), lat: null, lon: null, didok: null },
  ],
};

describe.skipIf(DATABASE_URL === undefined)('the reconcile against Postgres', () => {
  let sql: Sql;

  beforeAll(() => {
    sql = connect(DATABASE_URL ?? '');
  });

  afterAll(async () => {
    await sql.end();
  });

  async function inRolledBack(run: (tx: TransactionSql) => Promise<void>): Promise<void> {
    const attempt = sql.begin(async tx => {
      await tx`delete from public.rail_rides`;
      await tx`delete from public.rail_line_stops`;
      await tx`delete from public.rail_lines`;
      await run(tx);
      throw new Rollback();
    });

    await expect(attempt).rejects.toBeInstanceOf(Rollback);
  }

  /** What a person does in Studio: an update outside the reconcile's flag. */
  async function asPerson(tx: TransactionSql): Promise<void> {
    await tx`set local rail.reconciling = 'off'`;
  }

  it('reads back what it wrote as equal, so a second run plans nothing', async () => {
    await inRolledBack(async tx => {
      await applyPlan(tx, FEED);

      expect(isEmpty(planReconcile(FEED, await readState(tx)))).toBe(true);
    });
  });

  it('round-trips the committed CSVs', async () => {
    const read = async (file: string) =>
      parseCsv(await readFile(join(RAIL_DIR, file), 'utf8'));
    const feed = feedOf(await read('lines.csv'), await read('line_stops.csv'));

    await inRolledBack(async tx => {
      const plan = await applyPlan(tx, feed);

      expect(plan.lines.inserts).toHaveLength(feed.lines.length);
      expect(isEmpty(planReconcile(feed, await readState(tx)))).toBe(true);
    });
  });

  it('keeps a hand-edited display_name through a refresh from the same feed', async () => {
    await inRolledBack(async tx => {
      await applyPlan(tx, FEED);
      await asPerson(tx);
      await tx`update public.rail_lines set display_name = 'IR 35' where id = ${IR35.id}`;

      const plan = await applyPlan(tx, FEED);
      const [line] = await tx`
        select display_name, edited_fields from public.rail_lines where id = ${IR35.id}
      `;

      expect(plan.lines.skipped.map(skip => skip.field)).toEqual(['display_name']);
      expect(line).toEqual({ display_name: 'IR 35', edited_fields: ['display_name'] });
    });
  });

  it('does not record the reconcile’s own writes as edits', async () => {
    await inRolledBack(async tx => {
      await applyPlan(tx, FEED);
      await applyPlan(tx, {
        ...FEED,
        lines: [{ ...IR35, trips_per_week: 1 }, FEED.lines[1]],
      });

      const [line] = await tx`
        select trips_per_week, edited_fields from public.rail_lines where id = ${IR35.id}
      `;

      expect(line).toEqual({ trips_per_week: 1, edited_fields: [] });
    });
  });

  it('flags a line the next feed drops instead of deleting it, and restores it', async () => {
    await inRolledBack(async tx => {
      await applyPlan(tx, FEED);

      const dropped: Feed = {
        lines: [FEED.lines[1]],
        stops: FEED.stops.filter(row => row.line_id !== IR35.id),
      };
      const flagged = await applyPlan(tx, dropped);
      const [gone] = await tx`
        select count(*)::int as stops, bool_and(s.missing_since is not null) as flagged,
               bool_and(l.missing_since is not null) as line_flagged
        from public.rail_line_stops s join public.rail_lines l on l.id = s.line_id
        where l.id = ${IR35.id}
      `;

      expect(flagged.lines.flagged.map(target => target.label)).toEqual([IR35.id]);
      expect(gone).toEqual({ stops: 2, flagged: true, line_flagged: true });

      const restored = await applyPlan(tx, FEED);
      const [back] = await tx`
        select missing_since from public.rail_lines where id = ${IR35.id}
      `;

      expect(restored.lines.restored.map(target => target.label)).toEqual([IR35.id]);
      expect(back).toEqual({ missing_since: null });
    });
  });
});
