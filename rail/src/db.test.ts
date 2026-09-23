import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openGtfs, STORE } from './db.ts';

/**
 * A two-column feed is enough here: what is being tested is the wiring — that a
 * member becomes a queryable view, that nothing is coerced to a number, and that
 * a missing member is reported before a query runs — not any particular query.
 */

const ROUTES = `route_id,agency_id,route_short_name,route_desc,route_type
"91-3-B-j26-1","11","007","S","109"
`;

const AGENCY = `agency_id,agency_name
"11","Schweizerische Bundesbahnen SBB"
`;

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'rail-db-'));

  await Promise.all([
    writeFile(join(directory, 'routes.txt'), ROUTES, 'utf8'),
    writeFile(join(directory, 'agency.txt'), AGENCY, 'utf8'),
  ]);
});

afterEach(async () => {
  await rm(directory, { force: true, recursive: true });
});

describe('openGtfs', () => {
  it('registers each member as a view under its own name', async () => {
    const db = await openGtfs(directory, ['agency', 'routes']);

    try {
      expect(await db.query(`select count(*)::integer as n from routes`)).toEqual([{ n: 1 }]);
      expect(await db.query(`select agency_name from agency`)).toEqual([
        { agency_name: 'Schweizerische Bundesbahnen SBB' },
      ]);
    } finally {
      db.close();
    }
  });

  /** `007` is a line number, not seven; a coerced id also stops joining. */
  it('keeps a numeric-looking field as the string the feed wrote', async () => {
    const db = await openGtfs(directory, ['routes']);

    try {
      expect(await db.query(`select route_short_name from routes`)).toEqual([
        { route_short_name: '007' },
      ]);
    } finally {
      db.close();
    }
  });

  it('names every missing member rather than failing at the first query', async () => {
    await expect(openGtfs(directory, ['routes', 'stops', 'stop_times'])).rejects.toThrow(
      /missing stop_times.txt, stops.txt/,
    );
  });

  it('reports the directory that could not be opened', async () => {
    await expect(openGtfs(join(directory, 'gone'), ['routes'])).rejects.toThrow(
      /gone is missing routes.txt/,
    );
  });

  /** The point of a store: what a step writes into it outlives the connection. */
  it('keeps a table written into the store, and no view', async () => {
    const store = join(directory, 'store.duckdb');
    const written = await openGtfs(directory, ['routes'], { store });

    try {
      await written.run(
        `create table ${STORE}.rideable as select route_id from routes`,
      );
    } finally {
      written.close();
    }

    const reopened = await openGtfs(directory, [], { store });

    try {
      expect(await reopened.query(`select route_id from ${STORE}.rideable`)).toEqual([
        { route_id: '91-3-B-j26-1' },
      ]);

      // The CSV views are scaffolding for the run that made them; a store that
      // carried them would carry absolute paths into the next machine too.
      expect(
        await reopened.query(
          `select view_name from duckdb_views() where database_name = '${STORE}'`,
        ),
      ).toEqual([]);
    } finally {
      reopened.close();
    }
  });
});
