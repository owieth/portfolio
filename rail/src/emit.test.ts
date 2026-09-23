import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { CATEGORIES } from './allowlist/categories.ts';
import schema from '../lines.schema.json' with { type: 'json' };
import {
  assertGeometry,
  assertReferences,
  emitArtifacts,
  LINE_STOPS_CSV,
  LINES_CSV,
  LINES_GEOJSON,
  LINES_JSON,
  renderArtifacts,
} from './emit.ts';
import { ATTRIBUTION, EC, GELMERBAHN, S12, STATIONS } from './emit/fixtures.ts';
import type { LineRecord } from './emit/rows.ts';
import type { TerminiLine } from './termini.ts';

const LINES: TerminiLine[] = [S12, GELMERBAHN, EC];

const logged: string[] = [];

const log = (message: string): void => {
  logged.push(message);
};

const directories: string[] = [];

async function outputDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'rail-emit-'));
  directories.push(dir);
  return dir;
}

async function emit(
  lines: readonly TerminiLine[] = LINES,
): Promise<Record<string, string>> {
  const dir = await outputDir();
  await emitArtifacts({ lines, stations: STATIONS, attribution: ATTRIBUTION }, log, { dir });

  const names = await readdir(dir);
  const files = await Promise.all(
    names.map(name => readFile(join(dir, name), 'utf8')),
  );
  return Object.fromEntries(
    names.map((name, index) => [name, files[index] ?? '']),
  );
}

afterEach(async () => {
  logged.length = 0;
  await Promise.all(
    directories.splice(0).map(dir => rm(dir, { force: true, recursive: true })),
  );
});

describe('emitArtifacts', () => {
  it('writes the four files', async () => {
    const files = await emit();

    expect(Object.keys(files).sort()).toEqual([
      LINE_STOPS_CSV,
      LINES_CSV,
      LINES_GEOJSON,
      LINES_JSON,
    ]);
  });

  it('writes the same bytes twice, whatever order the lines arrive in', async () => {
    const first = await emit();
    const second = await emit([...LINES].reverse());

    expect(second).toEqual(first);
  });

  it('orders the lines by id, by code unit', async () => {
    const files = await emit();
    const ids = (files[LINES_CSV] ?? '')
      .trimEnd()
      .split('\n')
      .slice(1)
      .map(row => row.split(',')[0]);

    expect(ids).toEqual([EC.id, GELMERBAHN.id, S12.id]);
  });

  it('writes lines.csv with an international line’s true termini and empty cells for nulls', async () => {
    const files = await emit();

    expect(files[LINES_CSV]).toBe(
      [
        'id,display_name,category,network_region,operators,terminal_a,terminal_b,true_terminal_a,true_terminal_b,route_ids,seasonal,trips_per_week,has_geometry',
        'fernverkehr:EC:8500309-8506000,EC Brugg AG-Winterthur,EC,fernverkehr,DB Fernverkehr AG,Brugg AG,Winterthur,Brugg AG,Stuttgart Hbf,91-EC-j26-1,false,406,true',
        'kwo-seilbahnen:FUN:8531013-8531014,Gelmerbahn,FUN,kwo-seilbahnen,KWO Seilbahnen,Handegg,Gelmersee,Handegg,Gelmersee,,,,false',
        's-bahn-zuerich:S12,S12,S,s-bahn-zuerich,BLS AG;Schweizerische Bundesbahnen SBB,Brugg AG,Wil SG,Brugg AG,Wil SG,91-12-j26-1;91-12-j26-2,false,406,true',
        '',
      ].join('\n'),
    );
  });

  it('writes line_stops.csv in canonical order, with a seeded stop’s own name and empty cells for nulls', async () => {
    const files = await emit([GELMERBAHN]);

    expect(files[LINE_STOPS_CSV]).toBe(
      [
        'line_id,sequence,stop_name,sloid,didok,lat,lon,via,junction',
        'kwo-seilbahnen:FUN:8531013-8531014,1,Handegg,ch:1:sloid:31013,8531013,46.613585,8.308709,backbone,',
        'kwo-seilbahnen:FUN:8531013-8531014,2,Gelmersee,,,46.614439,8.320473,backbone,',
        '',
      ].join('\n'),
    );
  });

  it('nests the same records in lines.json', async () => {
    const files = await emit();
    const document = JSON.parse(files[LINES_JSON] ?? '') as {
      lines: { id: string; stops: unknown[] }[];
    };

    expect(document.lines.map(line => [line.id, line.stops.length])).toEqual([
      [EC.id, 2],
      [GELMERBAHN.id, 2],
      [S12.id, 4],
    ]);
    expect(files[LINES_JSON]?.endsWith('}\n')).toBe(true);
  });

  it('references a line in lines.csv from every row of line_stops.csv', async () => {
    const files = await emit();
    const ids = new Set(
      (files[LINES_CSV] ?? '')
        .trimEnd()
        .split('\n')
        .slice(1)
        .map(row => row.split(',')[0]),
    );
    const stopLineIds = (files[LINE_STOPS_CSV] ?? '')
      .trimEnd()
      .split('\n')
      .slice(1)
      .map(row => row.split(',')[0]);

    expect(stopLineIds).toHaveLength(8);
    expect(stopLineIds.every(id => ids.has(id))).toBe(true);
  });

  it('draws exactly the lines lines.json marks has_geometry, keyed by their id', async () => {
    const files = await emit();
    const document = JSON.parse(files[LINES_JSON] ?? '') as {
      lines: { id: string; has_geometry: boolean }[];
    };
    const geojson = JSON.parse(files[LINES_GEOJSON] ?? '') as {
      type: string;
      attribution: { text: string };
      features: { properties: { id: string } }[];
    };

    expect(geojson.type).toBe('FeatureCollection');
    expect(geojson.attribution.text).toBe('© OpenStreetMap contributors');
    expect(geojson.features.map(feature => feature.properties.id)).toEqual(
      document.lines.filter(line => line.has_geometry).map(line => line.id),
    );
    expect(geojson.features.map(feature => feature.properties.id)).toEqual([EC.id, S12.id]);
  });

  it('logs what it wrote with a fingerprint per file', async () => {
    await emit();

    expect(logged[0]).toMatch(
      /^wrote 3 lines, 8 line stops and 2 line shapes, validated against lines\.schema\.json — fingerprints lines\.csv [0-9a-f]{16}, line_stops\.csv [0-9a-f]{16}, lines\.json [0-9a-f]{16}, lines\.geojson [0-9a-f]{16}$/,
    );
  });

  it('hands verify the finished records, in id order', async () => {
    const verified: string[] = [];

    await emitArtifacts({ lines: LINES, stations: STATIONS, attribution: ATTRIBUTION }, log, {
      dir: await outputDir(),
      verify: records => verified.push(...records.map(record => record.id)),
    });

    expect(verified).toEqual([EC.id, GELMERBAHN.id, S12.id].sort());
  });

  it('writes nothing when verify throws', async () => {
    const dir = await outputDir();

    await expect(
      emitArtifacts({ lines: LINES, stations: STATIONS, attribution: ATTRIBUTION }, log, {
        dir,
        verify: () => {
          throw new Error('IC1: expected fernverkehr:IC1, but there is no line fernverkehr:IC1');
        },
      }),
    ).rejects.toThrow('IC1: expected fernverkehr:IC1');
    expect(await readdir(dir)).toEqual([]);
    expect(logged).toEqual([]);
  });
});

describe('renderArtifacts', () => {
  it('refuses a line the schema does not allow, before anything is written', async () => {
    const dir = await outputDir();
    const broken: TerminiLine = { ...S12, region: 'Not A Slug' };

    await expect(
      emitArtifacts({ lines: [broken], stations: STATIONS, attribution: ATTRIBUTION }, log, { dir }),
    ).rejects.toThrow(
      /does not match lines\.schema\.json, so nothing was written:\n {2}\/lines\/0\/network_region must match pattern/,
    );
    expect(await readdir(dir)).toEqual([]);
  });

  it('refuses a line with fewer than two stops', () => {
    const lonely: TerminiLine = { ...S12, sequence: S12.sequence.slice(0, 1) };

    expect(() =>
      renderArtifacts({ lines: [lonely], stations: STATIONS, attribution: ATTRIBUTION }),
    ).toThrow(/\/lines\/0\/stops must NOT have fewer than 2 items/);
  });

  it('refuses two lines on one id', () => {
    expect(() =>
      renderArtifacts({ lines: [S12, S12], stations: STATIONS, attribution: ATTRIBUTION }),
    ).toThrow(/two lines share the id s-bahn-zuerich:S12/);
  });

  it('refuses an operator that would split into two in the CSV', () => {
    const split: TerminiLine = { ...S12, operators: ['BLS AG;SBB'] };

    expect(() =>
      renderArtifacts({ lines: [split], stations: STATIONS, attribution: ATTRIBUTION }),
    ).toThrow(/\/lines\/0\/operators\/0 must match pattern "\^\[\^;\]\*\$"/);
  });
});

describe('assertReferences', () => {
  it('refuses a stop on a line that is not in lines.csv', () => {
    expect(() =>
      assertReferences(new Set([S12.id]), [S12.id, 'test:gone']),
    ).toThrow(
      /line_stops\.csv has a stop on test:gone, which is not a line in lines\.csv/,
    );
  });
});

describe('assertGeometry', () => {
  const records = [
    { id: S12.id, has_geometry: true },
    { id: GELMERBAHN.id, has_geometry: false },
  ] as LineRecord[];

  it('accepts a feature for every line with geometry and none for the rest', () => {
    expect(() => assertGeometry(records, [S12.id])).not.toThrow();
  });

  it('refuses a feature for a line that is not in lines.json', () => {
    expect(() => assertGeometry(records, [S12.id, 'test:gone'])).toThrow(
      /lines\.geojson has a feature for test:gone, which is not a line in lines\.json/,
    );
  });

  it('refuses a line with has_geometry and no feature', () => {
    expect(() => assertGeometry(records, [])).toThrow(
      /s-bahn-zuerich:S12 has has_geometry true in lines\.json but no feature in lines\.geojson/,
    );
  });

  it('refuses a feature for a line without has_geometry', () => {
    expect(() => assertGeometry(records, [S12.id, GELMERBAHN.id])).toThrow(
      /kwo-seilbahnen:FUN:8531013-8531014 has has_geometry false in lines\.json but a feature in lines\.geojson/,
    );
  });
});

describe('lines.schema.json', () => {
  it('allows exactly the categories the allowlist lets through', () => {
    expect(schema.$defs.line.properties.category.enum).toEqual(
      Object.keys(CATEGORIES),
    );
  });
});
