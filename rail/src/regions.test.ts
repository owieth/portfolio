import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { AllowedRoute } from './allowlist.ts';
import { ingestStopTimes } from './ingest.ts';
import { assignRegions } from './regions.ts';

/**
 * A handwritten feed rather than the real one, which only exists on a machine
 * that has run `pnpm build:data`. Stop ids, names and Didok numbers are copied
 * from the 2026 feed.
 *
 * Three SBB `S1`s in three networks — the case the step exists for — plus a
 * route that runs through Zürich HB without stopping there, and a funicular.
 */
const AGENCY = `agency_id,agency_name,agency_url,agency_timezone,agency_lang,agency_phone
"11","Schweizerische Bundesbahnen SBB","https://www.sbb.ch/","Europe/Berlin","DE","0848 44 66 88"
"849","Verkehrsbetriebe Zürich","https://www.vbz.ch/","Europe/Berlin","DE",""
`;

const STOPS = `stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station,platform_code,original_stop_id,didok
"Parentch:1:sloid:3000","Zürich HB","47.37817620","8.54021154","1","","","ch:1:sloid:3000","8503000"
"ch:1:sloid:3000:3:4","Zürich HB","47.37840735","8.53625895","","Parentch:1:sloid:3000","4","ch:1:sloid:3000:3:4","8503000"
"ch:1:sloid:7000:1:21","Bern","46.94882900","7.43912700","","Parentch:1:sloid:7000","21","ch:1:sloid:7000:1:21","8507000"
"ch:1:sloid:1120:0:1","Lausanne","46.51679900","6.62909100","","Parentch:1:sloid:1120","1","ch:1:sloid:1120:0:1","8501120"
"ch:1:sloid:218:0:7","Olten","47.35191800","7.90748000","","Parentch:1:sloid:218","7","ch:1:sloid:218:0:7","8500218"
"ch:1:sloid:3012","Zürich Polybahn","47.37631700","8.54423300","","","","ch:1:sloid:3012","8503012"
`;

const TRIPS = `route_id,service_id,trip_id,trip_headsign,trip_short_name,direction_id
"91-1-Z-j26-1","TA+b0001","1.TA.91-1-Z-j26-1.1.H","Zürich HB","18101","0"
"91-1-E-j26-1","TA+b0001","2.TA.91-1-E-j26-1.1.H","Bern","15101","0"
"91-1-V-j26-1","TA+b0001","3.TA.91-1-V-j26-1.1.H","Lausanne","12101","0"
"91-2-X-j26-1","TA+b0001","4.TA.91-2-X-j26-1.1.H","Olten","19201","0"
"91-FUN-j26-1","TA+b0001","5.TA.91-FUN-j26-1.1.H","Zürich Polybahn","1","0"
`;

/** Trip 4 passes Zürich HB — `pickup_type` and `drop_off_type` both 1 — and stops at Olten. */
const STOP_TIMES = `trip_id,arrival_time,departure_time,stop_id,stop_sequence,pickup_type,drop_off_type
"1.TA.91-1-Z-j26-1.1.H","","06:04:00","ch:1:sloid:3000:3:4","1","0","0"
"2.TA.91-1-E-j26-1.1.H","","06:04:00","ch:1:sloid:7000:1:21","1","0","0"
"3.TA.91-1-V-j26-1.1.H","","06:04:00","ch:1:sloid:1120:0:1","1","0","0"
"4.TA.91-2-X-j26-1.1.H","","06:04:00","ch:1:sloid:3000:3:4","1","1","1"
"4.TA.91-2-X-j26-1.1.H","06:40:00","","ch:1:sloid:218:0:7","2","0","0"
"5.TA.91-FUN-j26-1.1.H","","06:04:00","ch:1:sloid:3012","1","0","0"
`;

const ROUTES: AllowedRoute[] = [
  { routeId: '91-1-E-j26-1', agencyId: '11', shortName: 'S1', category: 'S' },
  { routeId: '91-1-V-j26-1', agencyId: '11', shortName: 'S1', category: 'S' },
  { routeId: '91-1-Z-j26-1', agencyId: '11', shortName: 'S1', category: 'S' },
  { routeId: '91-2-X-j26-1', agencyId: '11', shortName: 'S2', category: 'S' },
  { routeId: '91-FUN-j26-1', agencyId: '849', shortName: '2020', category: 'FUN' },
];

const RULES = {
  regions: {
    's-bahn-zuerich': 'S-Bahn Zürich',
    's-bahn-bern': 'S-Bahn Bern',
    'rer-vaud': 'RER Vaud',
  },
  rules: [
    { byOperator: true, categories: ['FUN'] },
    { region: 's-bahn-zuerich', serves: [{ didok: '8503000', name: 'Zürich HB' }] },
    { region: 's-bahn-bern', serves: [{ didok: '8507000', name: 'Bern' }] },
    { region: 'rer-vaud', serves: [{ didok: '8501120', name: 'Lausanne' }] },
  ],
};

/** The same file with one more region and one more rule, and nothing else. */
const RULES_WITH_OLTEN = {
  regions: { ...RULES.regions, 's-bahn-aargau': 'S-Bahn Aargau' },
  rules: [
    ...RULES.rules,
    { region: 's-bahn-aargau', serves: [{ didok: '8500218', name: 'Olten' }] },
  ],
};

const logged: string[] = [];

const log = (message: string): void => {
  logged.push(message);
};

let feedDir: string;
let rules: string;
let rulesWithOlten: string;

async function writeJson(name: string, value: unknown): Promise<string> {
  const path = join(feedDir, name);
  await writeFile(path, JSON.stringify(value), 'utf8');
  return path;
}

beforeAll(async () => {
  feedDir = await mkdtemp(join(tmpdir(), 'rail-regions-'));
  const gtfs = join(feedDir, 'gtfs');
  await mkdir(gtfs);

  await Promise.all([
    writeFile(join(gtfs, 'agency.txt'), AGENCY, 'utf8'),
    writeFile(join(gtfs, 'stops.txt'), STOPS, 'utf8'),
    writeFile(join(gtfs, 'trips.txt'), TRIPS, 'utf8'),
    writeFile(join(gtfs, 'stop_times.txt'), STOP_TIMES, 'utf8'),
  ]);

  await ingestStopTimes(feedDir, () => {}, { force: false });

  [rules, rulesWithOlten] = await Promise.all([
    writeJson('regions.json', RULES),
    writeJson('regions-with-olten.json', RULES_WITH_OLTEN),
  ]);
});

beforeEach(() => {
  logged.length = 0;
});

afterAll(async () => {
  await rm(feedDir, { force: true, recursive: true });
});

describe('assignRegions', () => {
  it('files three SBB S1s under three regions by the stations they serve', async () => {
    const { routes } = await assignRegions(feedDir, ROUTES, log, rules);
    const s1 = routes.filter(route => route.shortName === 'S1');

    expect(s1.map(route => [route.routeId, route.region, route.source])).toEqual([
      ['91-1-E-j26-1', 's-bahn-bern', 'rule'],
      ['91-1-V-j26-1', 'rer-vaud', 'rule'],
      ['91-1-Z-j26-1', 's-bahn-zuerich', 'rule'],
    ]);
  });

  it('files a byOperator route under its operator without calling it unassigned', async () => {
    const { routes, unassigned } = await assignRegions(feedDir, ROUTES, log, rules);

    expect(routes.find(route => route.category === 'FUN')).toMatchObject({
      region: 'verkehrsbetriebe-zuerich',
      source: 'operator',
    });
    expect(unassigned.map(route => route.routeId)).not.toContain('91-FUN-j26-1');
  });

  /**
   * The S2 runs through Zürich HB without stopping. Counting that as serving it
   * would file the line under Zürich, which is the wrong answer and a silent one.
   */
  it('does not count a station the train passes without stopping', async () => {
    const { routes, unassigned } = await assignRegions(feedDir, ROUTES, log, rules);

    expect(routes.find(route => route.shortName === 'S2')).toMatchObject({
      region: 'schweizerische-bundesbahnen-sbb',
      source: 'fallback',
    });
    expect(unassigned).toEqual([
      {
        routeId: '91-2-X-j26-1',
        category: 'S',
        shortName: 'S2',
        operator: 'Schweizerische Bundesbahnen SBB',
        region: 'schweizerische-bundesbahnen-sbb',
      },
    ]);
    expect(logged).toContain(
      'route 91-2-X-j26-1 S2 by Schweizerische Bundesbahnen SBB matched no rule — filed under schweizerische-bundesbahnen-sbb; add a rule to data/regions.json',
    );
  });

  it('places a new region from the rule file alone', async () => {
    const { routes, unassigned } = await assignRegions(
      feedDir,
      ROUTES,
      log,
      rulesWithOlten,
    );

    expect(routes.find(route => route.shortName === 'S2')).toMatchObject({
      region: 's-bahn-aargau',
      source: 'rule',
    });
    expect(unassigned).toEqual([]);
  });

  it('counts routes per region, busiest first', async () => {
    const { regions } = await assignRegions(feedDir, ROUTES, log, rules);

    expect(regions).toEqual([
      { region: 'rer-vaud', name: 'RER Vaud', routes: 1 },
      { region: 's-bahn-bern', name: 'S-Bahn Bern', routes: 1 },
      { region: 's-bahn-zuerich', name: 'S-Bahn Zürich', routes: 1 },
      {
        region: 'schweizerische-bundesbahnen-sbb',
        name: 'Schweizerische Bundesbahnen SBB',
        routes: 1,
      },
      { region: 'verkehrsbetriebe-zuerich', name: 'Verkehrsbetriebe Zürich', routes: 1 },
    ]);
  });

  it('says so when a rule names a station the feed spells differently', async () => {
    const misspelt = await writeJson('regions-misspelt.json', {
      ...RULES,
      rules: [
        ...RULES.rules,
        { region: 'rer-vaud', serves: [{ didok: '8500218', name: 'Olten Bahnhof' }] },
      ],
    });

    await assignRegions(feedDir, ROUTES, log, misspelt);

    expect(logged).toContain(
      'rule 5: station 8500218 is Olten in the feed, not Olten Bahnhof; fix data/regions.json',
    );
  });

  it('says so when a rule matches nothing, which is what a stale rule looks like', async () => {
    const stale = await writeJson('regions-stale.json', {
      regions: { ...RULES.regions, tilo: 'TILO' },
      rules: [
        ...RULES.rules,
        { region: 'tilo', serves: [{ didok: '8505300', name: 'Lugano' }] },
      ],
    });

    await assignRegions(feedDir, ROUTES, log, stale);

    expect(logged).toContain(
      'rule 5 (tilo) matched no route in this feed; it may be stale',
    );
  });
});
