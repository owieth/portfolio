import { beforeEach, describe, expect, it } from 'vitest';

import type { Category } from './allowlist/categories.ts';
import { matchLines } from './match.ts';
import type { MatchedLine } from './match.ts';
import type { OsmMember, OsmRelation } from './overpass.ts';
import type { SeasonalFeedLine, SeasonalLine, SeasonalManualLine } from './seasonal.ts';
import type { Station } from './stations.ts';

/**
 * Values rather than an Overpass answer on disk: the step opens nothing, so its
 * fixture is what the seasonal and Overpass steps would have handed it. Two
 * stretches of straight track stand in for two networks, Bern's along 46.9° N
 * and Basel's along 47.5° N, with a station every 0.02° of longitude — about a
 * kilometre and a half, well clear of any tolerance.
 */
const BERN_LAT = 46.9;
const BASEL_LAT = 47.5;

function didok(lat: number, index: number): string {
  return `85${lat === BERN_LAT ? '07' : '00'}${String(index).padStart(3, '0')}`;
}

function station(lat: number, index: number): Station {
  return {
    didok: didok(lat, index),
    sloid: null,
    name: `${lat === BERN_LAT ? 'Bern' : 'Basel'} ${index}`,
    lat,
    lon: 7 + index * 0.02,
    stops: 1,
  };
}

const STATIONS: Station[] = [BERN_LAT, BASEL_LAT].flatMap(lat =>
  Array.from({ length: 10 }, (_, index) => station(lat, index)),
);

interface LineOptions {
  id: string;
  category?: Category;
  number?: string | null;
  operators?: string[];
  lat?: number;
  /** Indexes of its stations, in running order. */
  stops: number[];
}

function feedLine({
  id,
  category = 'S',
  number = null,
  operators = ['BLS AG (bls)'],
  lat = BERN_LAT,
  stops,
}: LineOptions): SeasonalFeedLine {
  const stations = stops.map(index => didok(lat, index));

  return {
    id,
    category,
    number,
    region: id.slice(0, id.indexOf(':')),
    terminals: null,
    operators,
    routeIds: [id],
    stations: [...stations].sort(),
    name: number ?? id,
    nameSource: number === null ? 'derived' : 'number',
    review: [],
    source: 'feed',
    sequence: stations.map(value => ({ didok: value, via: 'backbone', junction: null })),
    patterns: [],
    serviceDays: 364,
    serviceWeeks: 52,
    seasonal: false,
    tripsPerWeek: 100,
  };
}

const GELMERBAHN: SeasonalManualLine = {
  id: 'kwo-seilbahnen:FUN:8531013-8531014',
  category: 'FUN',
  number: null,
  region: 'kwo-seilbahnen',
  terminals: ['8531013', '8531014'],
  operators: ['KWO Seilbahnen'],
  routeIds: [],
  stations: ['8531013', '8531014'],
  name: 'Gelmerbahn',
  nameSource: 'manual',
  review: [],
  source: 'manual',
  stops: [
    { didok: '8531014', name: 'Gelmersee', lat: 46.614439, lon: 8.320473 },
    { didok: '8531013', name: 'Handegg', lat: 46.613585, lon: 8.308709 },
  ],
  serviceDays: null,
  serviceWeeks: null,
  seasonal: null,
  tripsPerWeek: null,
};

interface RelationOptions {
  id: number;
  tags?: Record<string, string>;
  lat?: number;
  /** Station indexes it runs through, in member order. */
  through: number[];
  route?: OsmRelation['route'];
  /** Whether it lists stop nodes, as a PTv2 relation does. */
  stops?: boolean;
}

/**
 * One way per pair of neighbouring stations, with an id that is a function of
 * the pair: two relations over the same track share ways the way two OSM
 * relations over the same track do.
 */
function relation({
  id,
  tags = {},
  lat = BERN_LAT,
  through,
  route = 'train',
  stops = true,
}: RelationOptions): OsmRelation {
  const point = (index: number) => ({ lat, lon: 7 + index * 0.02 });
  const ways: OsmMember[] = through.slice(1).map((to, index) => {
    const from = through[index] as number;
    const [low, high] = from < to ? [from, to] : [to, from];

    return {
      type: 'way',
      ref: Math.round(lat * 1000) * 1000 + low * 10 + high,
      role: '',
      geometry: [point(from), point(to)],
    };
  });
  const nodes: OsmMember[] = stops
    ? through.map(index => ({ type: 'node', ref: index, role: 'stop', ...point(index) }))
    : [];

  return { id, route, tags: { type: 'route', route, ...tags }, members: [...nodes, ...ways] };
}

let logged: string[];

const log = (message: string): void => {
  logged.push(message);
};

beforeEach(() => {
  logged = [];
});

function run(lines: SeasonalLine[], relations: OsmRelation[]) {
  return matchLines({ lines, relations, stations: STATIONS, operators: [] }, log);
}

function find(lines: readonly MatchedLine[], id: string): MatchedLine {
  const line = lines.find(candidate => candidate.id === id);

  if (line === undefined) {
    throw new Error(`no line ${id}`);
  }

  return line;
}

describe('matchLines', () => {
  it('gives each of two S1s the relation in its own region, never the other', () => {
    const bern = feedLine({ id: 's-bahn-bern:S1', number: 'S1', stops: [0, 1, 2, 3] });
    const basel = feedLine({ id: 's-bahn-basel:S1', number: 'S1', lat: BASEL_LAT, stops: [0, 1, 2, 3] });
    const { lines } = run(
      [basel, bern],
      [
        relation({ id: 1, tags: { ref: 'S1' }, through: [0, 1, 2, 3] }),
        relation({ id: 2, tags: { ref: 'S1' }, lat: BASEL_LAT, through: [0, 1, 2, 3] }),
      ],
    );

    expect(find(lines, 's-bahn-bern:S1').match).toEqual({ rule: 'ref', confidence: 1, relations: [1] });
    expect(find(lines, 's-bahn-basel:S1').match).toEqual({ rule: 'ref', confidence: 1, relations: [2] });
  });

  it('merges both directions into one MultiLineString', () => {
    const [line] = run(
      [feedLine({ id: 'fernverkehr:IR35', category: 'IR', number: 'IR35', stops: [0, 1, 2] })],
      [
        relation({ id: 10, tags: { ref: 'IR 35' }, through: [0, 1, 2] }),
        relation({ id: 11, tags: { ref: 'IR 35' }, through: [2, 1, 0] }),
      ],
    ).lines;

    expect(line?.match?.relations).toEqual([10, 11]);
    expect(line?.geometry).toEqual({
      type: 'MultiLineString',
      coordinates: [
        [
          [7, BERN_LAT],
          [7.02, BERN_LAT],
          [7.04, BERN_LAT],
        ],
      ],
    });
  });

  it('joins a line mapped in sections, and keeps a gap between them open', () => {
    const [line] = run(
      [feedLine({ id: 's-bahn-bern:S2', number: 'S2', stops: [0, 1, 2, 3, 4, 5] })],
      [
        relation({ id: 20, tags: { ref: 'S2' }, through: [0, 1, 2] }),
        relation({ id: 21, tags: { ref: 'S2' }, through: [3, 4, 5] }),
      ],
    ).lines;

    expect(line?.match).toEqual({ rule: 'ref', confidence: 1, relations: [20, 21] });
    expect(line?.geometry?.coordinates).toHaveLength(2);
  });

  it('matches a funicular mapped by name only by where it ends', () => {
    const { lines } = run(
      [GELMERBAHN],
      [
        {
          id: 30,
          route: 'funicular',
          tags: { type: 'route', route: 'funicular', name: 'Gelmerbahn' },
          members: [
            {
              type: 'way',
              ref: 300,
              role: '',
              geometry: [
                { lat: 46.61359, lon: 8.30871 },
                { lat: 46.61444, lon: 8.32047 },
              ],
            },
          ],
        },
      ],
    );

    expect(lines[0]?.match).toEqual({ rule: 'endpoints', confidence: 1, relations: [30] });
  });

  it('prefers a relation whose operator runs the line over one that only ends where it does', () => {
    const line = feedLine({ id: 'berner-oberland:R:8507000-8507003', category: 'R', stops: [0, 1, 2, 3] });
    const { lines } = run(
      [line],
      [
        relation({ id: 40, tags: { operator: 'BLS' }, through: [0, 1, 2, 3] }),
        relation({ id: 41, tags: { operator: 'SBB' }, through: [3, 2, 1, 0] }),
      ],
    );

    expect(lines[0]?.match).toEqual({ rule: 'operator', confidence: 1, relations: [40] });
  });

  it('leaves another line’s relation to the ref rule, however well it ends', () => {
    const ic = feedLine({ id: 'fernverkehr:IC:8500000-8500003', category: 'IC', lat: BASEL_LAT, stops: [0, 3] });
    const { lines, unmatched } = run(
      [ic],
      [relation({ id: 50, tags: { ref: 'ICE 20' }, lat: BASEL_LAT, through: [0, 1, 2, 3], stops: false })],
    );

    expect(lines[0]?.hasGeometry).toBe(false);
    expect(unmatched[0]?.reason).toBe('no-candidate');
  });

  it('rejects a relation that makes stops the line does not', () => {
    const { lines } = run(
      [feedLine({ id: 's-bahn-bern:S3', number: 'S3', stops: [0, 1] })],
      [relation({ id: 60, tags: { ref: 'S3' }, through: [0, 1, 2, 3, 4, 5] })],
    );

    expect(lines[0]?.hasGeometry).toBe(false);
  });

  it('gives a relation claimed twice to the stronger claim and lists the other as contested', () => {
    const bls = feedLine({ id: 'a:R:8507000-8507002', category: 'R', stops: [0, 1, 2] });
    const sbb = feedLine({
      id: 'b:R:8507000-8507002',
      category: 'R',
      operators: ['Schweizerische Bundesbahnen SBB'],
      stops: [0, 1, 2],
    });
    const { lines, unmatched } = run(
      [sbb, bls],
      [relation({ id: 70, tags: { operator: 'SBB' }, through: [0, 1, 2] })],
    );

    expect(find(lines, 'b:R:8507000-8507002').match).toEqual({ rule: 'operator', confidence: 1, relations: [70] });
    expect(unmatched).toEqual([
      { id: 'a:R:8507000-8507002', name: 'a:R:8507000-8507002', reason: 'contested', best: null, lostTo: ['b:R:8507000-8507002'] },
    ]);
  });

  it('keeps a relation named for one line from a line with no number', () => {
    const numbered = feedLine({ id: 's-bahn-bern:S4', number: 'S4', stops: [0, 1, 2] });
    const unnumbered = feedLine({ id: 's-bahn-bern:S:8507000-8507002', stops: [0, 1, 2] });
    const { lines, unmatched } = run(
      [numbered, unnumbered],
      [relation({ id: 71, tags: { ref: 'S4' }, through: [0, 1, 2] })],
    );

    expect(find(lines, 's-bahn-bern:S4').match?.relations).toEqual([71]);
    expect(unmatched.map(entry => [entry.id, entry.reason])).toEqual([
      ['s-bahn-bern:S:8507000-8507002', 'no-candidate'],
    ]);
  });

  it('shares a relation between the lines its ref names by their own numbers', () => {
    const re4 = feedLine({ id: 'rhaetische-bahn:RE4', category: 'RE', number: 'RE4', stops: [0, 1, 2, 3] });
    const re24 = feedLine({ id: 'rhaetische-bahn:RE24', category: 'RE', number: 'RE24', stops: [0, 1, 2, 3] });
    const { lines } = run([re24, re4], [relation({ id: 80, tags: { ref: 'RE24;RE4' }, through: [0, 1, 2, 3] })]);

    expect(find(lines, 'rhaetische-bahn:RE4').match?.relations).toEqual([80]);
    expect(find(lines, 'rhaetische-bahn:RE24').match?.relations).toEqual([80]);
  });

  it('breaks a tie between two equal claims by line id', () => {
    const first = feedLine({ id: 'a:R:8507000-8507002', category: 'R', stops: [0, 1, 2] });
    const second = feedLine({ id: 'b:R:8507000-8507002', category: 'R', stops: [0, 1, 2] });
    const { lines, unmatched } = run([second, first], [relation({ id: 90, through: [0, 1, 2] })]);

    expect(find(lines, 'a:R:8507000-8507002').match).toEqual({ rule: 'endpoints', confidence: 1, relations: [90] });
    expect(unmatched.map(entry => [entry.id, entry.reason, entry.lostTo])).toEqual([
      ['b:R:8507000-8507002', 'contested', ['a:R:8507000-8507002']],
    ]);
  });

  it('draws a diversion only for a line nothing regular draws', () => {
    const regular = relation({ id: 100, tags: { ref: 'S5' }, through: [0, 1, 2] });
    const diversion = relation({ id: 101, tags: { ref: 'S5', state: 'alternate' }, through: [0, 1, 2] });
    const s5 = feedLine({ id: 's-bahn-bern:S5', number: 'S5', stops: [0, 1, 2] });

    expect(run([s5], [regular, diversion]).lines[0]?.match?.relations).toEqual([100]);
    expect(run([s5], [diversion]).lines[0]?.match?.relations).toEqual([101]);
  });

  it('never draws a disused relation', () => {
    const { lines } = run(
      [feedLine({ id: 's-bahn-bern:S6', number: 'S6', stops: [0, 1, 2] })],
      [relation({ id: 110, tags: { ref: 'S6', disused: 'yes' }, through: [0, 1, 2] })],
    );

    expect(lines[0]?.hasGeometry).toBe(false);
  });

  it('records the share of the line a partial relation reaches, and refuses a fragment', () => {
    const s7 = feedLine({ id: 's-bahn-bern:S7', number: 'S7', stops: [0, 1, 2, 3, 4, 5, 6, 7] });

    expect(run([s7], [relation({ id: 120, tags: { ref: 'S7' }, through: [0, 1, 2, 3, 4] })]).lines[0]?.match)
      .toEqual({ rule: 'ref', confidence: 0.63, relations: [120] });

    const { lines, unmatched } = run([s7], [relation({ id: 121, tags: { ref: 'S7' }, through: [0, 1, 2] })]);

    expect(lines[0]?.geometry).toBeNull();
    expect(unmatched[0]).toMatchObject({ reason: 'low-coverage', best: { rule: 'ref', confidence: 0.38, relations: [121] } });
  });

  it('gives a line nothing draws no geometry and a report entry, never an empty shape', () => {
    const { lines, unmatched } = run([feedLine({ id: 's-bahn-bern:S8', number: 'S8', stops: [0, 1] })], []);

    expect(lines[0]).toMatchObject({ hasGeometry: false, geometry: null, match: null });
    expect(unmatched).toEqual([
      { id: 's-bahn-bern:S8', name: 'S8', reason: 'no-candidate', best: null, lostTo: [] },
    ]);
    expect(logged.some(message => message.includes('unmatched, no-candidate: s-bahn-bern:S8'))).toBe(true);
  });

  it('matches the same way twice', () => {
    const lines = [feedLine({ id: 's-bahn-bern:S1', number: 'S1', stops: [0, 1, 2, 3] })];
    const relations = [relation({ id: 1, tags: { ref: 'S1' }, through: [0, 1, 2, 3] })];

    expect(run(lines, relations).fingerprint).toBe(run(lines, relations).fingerprint);
  });
});
