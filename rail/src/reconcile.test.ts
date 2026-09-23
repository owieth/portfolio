import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RAIL_DIR } from './paths.ts';
import { readFeed, reconcileFeed } from './reconcile.ts';

describe('readFeed', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'rail-reconcile-'));
  });

  afterEach(async () => {
    await rm(dir, { force: true, recursive: true });
  });

  it('reads the two CSVs into typed rows', async () => {
    await writeFile(
      join(dir, 'lines.csv'),
      'id,display_name,category,network_region,operators,terminal_a,terminal_b,true_terminal_a,true_terminal_b,route_ids,seasonal,trips_per_week,has_geometry\nfernverkehr:IR35,IR35,IR,fernverkehr,BLS AG,Bern,Luzern,Bern,Luzern,,,,true\n',
    );
    await writeFile(
      join(dir, 'line_stops.csv'),
      'line_id,sequence,stop_name,sloid,didok,lat,lon,via,junction\nfernverkehr:IR35,1,Bern,,8507000,46.9,7.4,backbone,\n',
    );

    const feed = await readFeed(dir);

    expect(feed.lines[0]).toMatchObject({
      operators: ['BLS AG'],
      route_ids: [],
      seasonal: null,
    });
    expect(feed.stops[0]).toMatchObject({ sequence: 1, lat: 46.9 });
  });

  it('says which file it could not read', async () => {
    await expect(readFeed(dir)).rejects.toThrow(`cannot read ${join(dir, 'lines.csv')}`);
  });
});

/** Opt-in, like `reconcile/db.test.ts`: needs a freshly reset local Supabase. */
const DATABASE_URL = process.env.RAIL_TEST_DATABASE_URL;

describe.skipIf(DATABASE_URL === undefined)('reconcileFeed against the seeded database', () => {
  it('plans nothing for the CSVs the seed came from, and writes nothing', async () => {
    const { plan, markdown } = await reconcileFeed(
      { apply: false, dir: RAIL_DIR, databaseUrl: DATABASE_URL ?? '' },
      () => {},
    );

    expect(plan.lines.inserts).toEqual([]);
    expect(plan.lines.updates).toEqual([]);
    expect(plan.lines.flagged).toEqual([]);
    expect(markdown).toContain('Nothing to write.');
  });
});
