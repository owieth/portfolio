import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SEED_SQL, renderSeedFrom, writeSeed } from './dbseed.ts';

describe('the committed seed', () => {
  it('is what the committed CSVs generate', async () => {
    const { sql } = await renderSeedFrom();

    // A failure here means the CSVs changed without the seed: run pnpm seed:data.
    expect(await readFile(SEED_SQL, 'utf8')).toBe(sql);
  });
});

describe('writeSeed', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'rail-seed-'));
    await writeFile(
      join(dir, 'lines.csv'),
      'id,display_name,category,network_region,operators,terminal_a,terminal_b,true_terminal_a,true_terminal_b,route_ids,seasonal,trips_per_week,has_geometry\nfernverkehr:IR35,IR35,IR,fernverkehr,BLS AG,Bern,Luzern,Bern,Luzern,1,false,196,true\n',
    );
    await writeFile(
      join(dir, 'line_stops.csv'),
      'line_id,sequence,stop_name,sloid,didok,lat,lon,via,junction\nfernverkehr:IR35,1,Bern,,8507000,,,backbone,\nfernverkehr:IR35,2,Luzern,,8505000,,,backbone,\n',
    );
  });

  afterEach(async () => {
    await rm(dir, { force: true, recursive: true });
  });

  it('writes the seed, creating its directory, and counts the rows', async () => {
    const out = join(dir, 'seeds', 'rail.sql');
    const seeded = await writeSeed(() => {}, { dir, out });

    expect(seeded).toMatchObject({ lines: 1, stops: 2 });
    expect(await readFile(out, 'utf8')).toBe(seeded.sql);
  });
});
