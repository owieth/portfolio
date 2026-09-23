import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { allowRoutes } from './allowlist.ts';

/**
 * The step runs against a handwritten feed rather than against the real one. The
 * real feed is 256 MB and only exists on a machine that has run
 * `pnpm build:data`, so a test that needed it would be a test that never runs.
 *
 * One route per branch the step has: an ordinary S-Bahn, a long-distance train,
 * a funicular, the two foreign categories #468 decided to keep, the one it
 * decided to drop, `ZUG`, three shapes of excluded mode, and a category that
 * exists in no registry — which is the case the issue actually cares about.
 */
const ROUTES = `route_id,agency_id,route_short_name,route_long_name,route_desc,route_type
"91-3-B-j26-1","11","S3","","S","109"
"91-2A-Y-j26-1","11","EC","","EC","102"
"91-2N-Y-j26-1","11","TGV","","TGV","101"
"91-8R-Y-j26-1","800693","RB","","RB","106"
"91-1K-Y-j26-1","87_LEX","TER","","TER","106"
"91-ZZ-Y-j26-1","87_LEX","ZUG","","ZUG","100"
"91-EXT-A-j26-1","11","EXT","","EXT","117"
"93-24-j26-1","165","24","","FUN","1400"
"93-2G-Y-j26-1","258","SL","","SL","1300"
"92-A06-I-j26-1","700","6","","B","700"
"92-N01-I-j26-1","700","N1","","BN","705"
"91-QQ-Y-j26-1","11","QQ","","QQ","106"
`;

const ONLY_BUSES = `route_id,agency_id,route_short_name,route_long_name,route_desc,route_type
"92-A06-I-j26-1","700","6","","B","700"
`;

let directory: string;
let empty: string;
const logged: string[] = [];

const log = (message: string): void => {
  logged.push(message);
};

beforeAll(async () => {
  [directory, empty] = await Promise.all([
    mkdtemp(join(tmpdir(), 'rail-allowlist-')),
    mkdtemp(join(tmpdir(), 'rail-allowlist-empty-')),
  ]);

  await Promise.all([
    writeFile(join(directory, 'routes.txt'), ROUTES, 'utf8'),
    writeFile(join(empty, 'routes.txt'), ONLY_BUSES, 'utf8'),
  ]);
});

afterAll(async () => {
  await Promise.all([
    rm(directory, { force: true, recursive: true }),
    rm(empty, { force: true, recursive: true }),
  ]);
});

describe('allowRoutes', () => {
  it('keeps the rail and funicular routes and drops everything else', async () => {
    const allowed = await allowRoutes(directory, log);

    expect(allowed.routes).toEqual([
      { routeId: '91-2A-Y-j26-1', agencyId: '11', shortName: 'EC', category: 'EC' },
      { routeId: '91-2N-Y-j26-1', agencyId: '11', shortName: 'TGV', category: 'TGV' },
      { routeId: '91-3-B-j26-1', agencyId: '11', shortName: 'S3', category: 'S' },
      { routeId: '91-8R-Y-j26-1', agencyId: '800693', shortName: 'RB', category: 'RB' },
      { routeId: '91-ZZ-Y-j26-1', agencyId: '87_LEX', shortName: 'ZUG', category: 'ZUG' },
      { routeId: '93-24-j26-1', agencyId: '165', shortName: '24', category: 'FUN' },
    ]);
  });

  it('tallies what it dropped per route_type and route_desc', async () => {
    const allowed = await allowRoutes(directory, log);

    // Busiest first, then by code — every fixture route is one of a kind, so
    // this is the alphabetical tiebreak the log depends on to stay stable.
    expect(allowed.excluded).toEqual([
      { routeType: '700', routeDesc: 'B', routes: 1, reason: 'bus' },
      { routeType: '705', routeDesc: 'BN', routes: 1, reason: 'night bus' },
      { routeType: '117', routeDesc: 'EXT', routes: 1, reason: 'special-event train' },
      { routeType: '1300', routeDesc: 'SL', routes: 1, reason: 'chairlift' },
      { routeType: '106', routeDesc: 'TER', routes: 1, reason: 'French regional network' },
    ]);
  });

  it('reports a category no registry knows rather than dropping it silently', async () => {
    const allowed = await allowRoutes(directory, log);

    expect(allowed.unknown).toEqual([
      {
        routeType: '106',
        routeDesc: 'QQ',
        routes: 1,
        reason: 'QQ is not in the category vocabulary',
      },
    ]);
  });

  it('logs the excluded counts grouped by route_type, in route_type order', async () => {
    logged.length = 0;
    await allowRoutes(directory, log);

    expect(logged.filter(line => line.startsWith('excluded'))).toEqual([
      'excluded route_type 106 — TER 1',
      'excluded route_type 117 — EXT 1',
      'excluded route_type 700 — B 1',
      'excluded route_type 705 — BN 1',
      'excluded route_type 1300 — SL 1',
    ]);
  });

  it('names the unrecognised category in the log and says what to do about it', async () => {
    logged.length = 0;
    await allowRoutes(directory, log);

    expect(logged.find(line => line.startsWith('unrecognised'))).toContain('QQ');
    expect(logged.find(line => line.startsWith('unrecognised'))).toContain('pnpm recon:data');
  });

  it('flags ZUG for #475, which has to name it', async () => {
    logged.length = 0;
    await allowRoutes(directory, log);

    expect(logged.find(line => line.includes('ZUG'))).toContain('#475');
  });

  /**
   * A feed whose vocabulary moved wholesale would otherwise produce an empty
   * `lines.csv` and a clean exit, which is the one failure that looks like success.
   */
  it('fails when nothing survives rather than emitting an empty inventory', async () => {
    await expect(allowRoutes(empty, log)).rejects.toThrow(/no rideable routes survived/);
  });
});
