import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { openGtfs } from '../db.ts';
import type { Gtfs } from '../db.ts';
import {
  CATEGORIES,
  CATEGORY_ONLY_SAMPLES,
  COMBINATIONS,
  FUNICULARS,
  LINE_NUMBER_BY_AGENCY,
  MISTYPED_FUNICULARS,
  VARIANT_EXCEPTIONS,
  VARIANT_RULE,
  escapeLike,
  operatorSearch,
} from './queries.ts';
import type {
  AgencyRow,
  CategoryRow,
  CombinationRow,
  LiftRow,
  OperatorRow,
  SampleRow,
  VariantRow,
} from './queries.ts';

/**
 * The queries run against a handwritten feed rather than against the real one.
 * The real feed is 256 MB and only exists on a machine that has run
 * `pnpm build:data`, so a test that needed it would be a test that never runs.
 *
 * The fixture is small but not simple: it has one numbered line, one that is
 * category-only and marked `-Y-`, one that is category-only without the marker,
 * a funicular, an aerial lift whose operator is called a funicular, and a bus —
 * which is every shape the recon has to tell apart.
 */

const AGENCY = `agency_id,agency_name,agency_url,agency_timezone
"11","Schweizerische Bundesbahnen SBB","https://sbb.ch","Europe/Zurich"
"165","Poly-Bahn Zürich","https://polybahn.ch","Europe/Zurich"
"258","Funiculaire St-Luc-Chandolin","https://example.test","Europe/Zurich"
"700","Postauto","https://example.test","Europe/Zurich"
`;

const ROUTES = `route_id,agency_id,route_short_name,route_long_name,route_desc,route_type
"91-3-B-j26-1","11","S3","","S","109"
"91-2A-Y-j26-1","11","EC","","EC","102"
"91-EXT-A-j26-1","11","EXT","","EXT","117"
"93-24-j26-1","165","24","","FUN","1400"
"93-2G-Y-j26-1","258","SL","","SL","1300"
"92-A06-I-j26-1","700","6","","B","700"
`;

const TRIPS = `route_id,service_id,trip_id,trip_headsign,trip_short_name,direction_id
"91-3-B-j26-1","TA","t1","Zürich HB","11320","0"
"91-3-B-j26-1","TA","t2","Aarau","11322","1"
"91-2A-Y-j26-1","TA","t3","Milano","10","0"
"91-EXT-A-j26-1","TA","t4","Brig","900","0"
"93-24-j26-1","TA","t5","ETH","1","0"
"93-2G-Y-j26-1","TA","t6","Chandolin","2","0"
"92-A06-I-j26-1","TA","t7","Bern","3","0"
`;

let directory: string;
let db: Gtfs;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'rail-recon-'));

  await Promise.all([
    writeFile(join(directory, 'agency.txt'), AGENCY, 'utf8'),
    writeFile(join(directory, 'routes.txt'), ROUTES, 'utf8'),
    writeFile(join(directory, 'trips.txt'), TRIPS, 'utf8'),
  ]);

  db = await openGtfs(directory, ['agency', 'routes', 'trips']);
});

afterAll(async () => {
  db?.close();
  await rm(directory, { force: true, recursive: true });
});

describe('CATEGORIES', () => {
  it('counts every route_type and route_desc in the feed, excluded ones included', async () => {
    const rows = await db.query<CategoryRow>(CATEGORIES);

    expect(rows.map(row => [row.route_type, row.route_desc, row.routes, row.trips])).toEqual([
      ['102', 'EC', 1, 1],
      ['109', 'S', 1, 2],
      ['117', 'EXT', 1, 1],
      ['700', 'B', 1, 1],
      ['1300', 'SL', 1, 1],
      ['1400', 'FUN', 1, 1],
    ]);
  });
});

describe('COMBINATIONS', () => {
  it('covers rail and funicular and nothing else', async () => {
    const rows = await db.query<CombinationRow>(COMBINATIONS);

    expect(rows.map(row => row.route_type).sort()).toEqual(['102', '109', '117', '1400']);
    expect(rows.every(row => row.agency_name !== null)).toBe(true);
  });

  it('counts trips per combination rather than per route', async () => {
    const rows = await db.query<CombinationRow>(COMBINATIONS);
    const sBahn = rows.find(row => row.route_desc === 'S');

    expect(sBahn).toMatchObject({ routes: 1, trips: 2, agency_name: expect.any(String) });
  });
});

describe('CATEGORY_ONLY_SAMPLES', () => {
  it('returns only routes whose short name is the category, busiest first', async () => {
    const rows = await db.query<SampleRow>(CATEGORY_ONLY_SAMPLES);

    expect(rows.map(row => row.route_id)).toEqual(['91-2A-Y-j26-1', '91-EXT-A-j26-1']);
    expect(rows[0]).toMatchObject({ route_long_name: null, trip_short_name: '10' });
  });

  it('leaves the bus alone even though its short name is not a number', async () => {
    const rows = await db.query<SampleRow>(CATEGORY_ONLY_SAMPLES);

    expect(rows.some(row => row.route_id.startsWith('92-'))).toBe(false);
  });
});

describe('LINE_NUMBER_BY_AGENCY', () => {
  it('separates category-only routes from numbered ones per operator', async () => {
    const rows = await db.query<AgencyRow>(LINE_NUMBER_BY_AGENCY);
    const sbb = rows.find(row => row.agency_id === '11');

    expect(sbb).toMatchObject({ routes: 3, category_only: 2, long_name: 0 });
  });

  it('averages distinct trip_short_names per route, which is 1 for a line number', async () => {
    const rows = await db.query<AgencyRow>(LINE_NUMBER_BY_AGENCY);

    expect(rows.find(row => row.agency_id === '165')?.trip_short_name_per_route).toBe(1);
    expect(rows.find(row => row.agency_id === '11')?.trip_short_name_per_route).toBe(1.3);
  });
});

describe('FUNICULARS', () => {
  it('lists 1400 and nothing else', async () => {
    const rows = await db.query<LiftRow>(FUNICULARS);

    expect(rows).toEqual([
      {
        route_type: '1400',
        route_desc: 'FUN',
        agency_name: 'Poly-Bahn Zürich',
        route_short_name: '24',
        route_id: '93-24-j26-1',
        trips: 1,
      },
    ]);
  });
});

describe('MISTYPED_FUNICULARS', () => {
  it('finds a non-1400 route whose operator name says funicular', async () => {
    const rows = await db.query<LiftRow>(MISTYPED_FUNICULARS);

    expect(rows.map(row => row.route_id)).toEqual(['93-2G-Y-j26-1']);
  });
});

describe('VARIANT_RULE', () => {
  it('cross-tabs the route_id marker against the string test', async () => {
    const rows = await db.query<VariantRow>(VARIANT_RULE);

    expect(rows).toEqual([
      { y_variant: true, category_only: true, routes: 1 },
      { y_variant: false, category_only: true, routes: 1 },
      { y_variant: false, category_only: false, routes: 2 },
    ]);
  });

  it('names the routes that break the marker rule', async () => {
    const rows = await db.query<SampleRow>(VARIANT_EXCEPTIONS);

    expect(rows.map(row => row.route_id)).toEqual(['91-EXT-A-j26-1']);
  });
});

describe('operatorSearch', () => {
  it('matches on part of the operator name, case-insensitively', async () => {
    const rows = await db.query<OperatorRow>(operatorSearch('Poly'));

    expect(rows).toEqual([
      { agency_id: '165', agency_name: 'Poly-Bahn Zürich', route_types: '1400', routes: 1 },
    ]);
  });

  it('returns nothing for an operator the feed does not carry', async () => {
    expect(await db.query<OperatorRow>(operatorSearch('Gurtenbahn'))).toEqual([]);
  });

  /** A wildcard in a name would otherwise match every operator and read as a hit. */
  it('does not let a needle carry LIKE wildcards or a quote', async () => {
    expect(await db.query<OperatorRow>(operatorSearch('%'))).toEqual([]);
    expect(await db.query<OperatorRow>(operatorSearch("o'brien"))).toEqual([]);
  });

  it('escapes both wildcards and the quote', () => {
    expect(escapeLike("100%_o'clock")).toBe("100\\%\\_o''clock");
  });
});
