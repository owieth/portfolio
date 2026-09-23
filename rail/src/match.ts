/**
 * Step fourteen: find the OSM relations that draw each line, and join them into
 * one shape.
 *
 * Nothing links a feed line to an OSM relation. The feed has no geometry and no
 * OSM ids, and OSM has no Didok-keyed route list, so the two are matched on what
 * they share: a line number, an operator, and where the line runs. The rules are
 * tried strongest first, and a line takes the relations of the first one that
 * draws it:
 *
 * 1. `ref` — the relation's `ref` is the line's number.
 * 2. `operator` — one of its operators runs the line, and it ends at the line's
 *    two terminals.
 * 3. `endpoints` — it ends at the line's two terminals, whatever its tags say.
 *
 * Tags only nominate. The feed has an `S1` in five regions and OSM has a
 * relation for each, so every nomination is checked against the line's stations
 * before it counts: nearly every stop the relation makes in Switzerland has to
 * be one of the line's stations, or it is another line, however well its tags
 * fit. The relations a rule nominates then have to reach at least half of the
 * line's stations between them. A ref of another line keeps a relation from
 * the two weaker rules, so an IC is not drawn with the ICE from Hamburg that
 * ends at the same two stations. And a relation goes to one line only — the one
 * with the strongest claim — unless its `ref` names several lines and each
 * holds it by its own number, as the RhB's `RE24;RE4` does.
 *
 * The relations a line takes — both directions, the sections of a line mapped
 * in parts — are joined into one MultiLineString by `match/linemerge.ts`. A line
 * nothing draws gets no geometry and an entry saying why, never an empty shape.
 * A relation that runs past the border is kept whole.
 *
 * Pure: it takes the lines, the relations, the stations and the operator table,
 * and opens nothing.
 */

import { createHash } from 'node:crypto';

import type { LatLon } from '../../src/lib/geo/ch.ts';
import { metres, metresToLines } from './match/geo.ts';
import { linemerge } from './match/linemerge.ts';
import type { Way } from './match/linemerge.ts';
import {
  RULES,
  isAlternate,
  isDisused,
  lineRefs,
  namesAnotherLine,
  operatorMatches,
  operatorNames,
  relationRefs,
  routeTypeOf,
} from './match/rules.ts';
import type { Rule } from './match/rules.ts';
import { compare } from './merge/key.ts';
import type { Operator } from './naming/operators.ts';
import type { OsmPoint, OsmRelation } from './overpass.ts';
import type { RouteType } from './overpass/query.ts';
import type { SeasonalLine } from './seasonal.ts';
import type { Station } from './stations.ts';

/**
 * How far from a station a relation's track or stop may lie and still be at
 * that station. A station's coordinate is the stop place, which at a large
 * station can be hundreds of metres from the platform a line uses: the IR65's
 * stop at Bern is 414 m from it. A funicular's stations sit closer together
 * than that, so it gets a tighter radius. Otherwise its top station could stand
 * in for the one next door. Against the 2026 feed, 300 m to 600 m and 100 m to
 * 200 m match the same lines to within one.
 */
export const TOLERANCE_M: Readonly<Record<RouteType, number>> = { train: 500, funicular: 100 };

/**
 * The share of a relation's stops at Swiss stations that have to be stations of
 * the line. This is the guard against the wrong line. Not all of them, because
 * OSM and the feed disagree at the edges: a stop OSM still lists that the
 * timetable no longer serves, or a request stop the feed leaves out.
 */
export const MIN_PRECISION = 0.8;

/**
 * The share of the line's stations the nominated relations have to reach
 * between them. A relation that passed the precision check is this line's, so
 * this only asks whether enough of it is mapped to be worth drawing. The IC5
 * relation runs Lausanne to Rorschach and the feed's IC5 goes on to Genève,
 * which leaves it at 0.79. Below half, what OSM has is a fragment, and a
 * fragment drawn as the line would look like the whole of it. The share is
 * the match's `confidence`, so a partial shape is never mistaken for a full
 * one.
 */
export const MIN_COVERAGE = 0.5;

/** How many line ids the log names per list. */
const SHOWN = 5;

/** GeoJSON, so the emit step writes it as it is: `[lon, lat]`. */
export interface Geometry {
  type: 'MultiLineString';
  coordinates: [number, number][][];
}

export interface Match {
  rule: Rule;
  /** The share of the line's stations its geometry reaches, to two places. */
  confidence: number;
  /** OSM relation ids, ascending. */
  relations: number[];
}

export type MatchedLine = SeasonalLine &
  (
    | { hasGeometry: true; geometry: Geometry; match: Match }
    | { hasGeometry: false; geometry: null; match: null }
  );

/**
 * - `no-candidate` — no relation passed any rule.
 * - `low-coverage` — relations passed, but reach too few of the line's stations.
 * - `contested` — the relations it had went to lines with a stronger claim.
 */
export type UnmatchedReason = 'no-candidate' | 'low-coverage' | 'contested';

/** A line with no geometry, for the report. */
export interface Unmatched {
  id: string;
  name: string;
  reason: UnmatchedReason;
  /** The nearest it came: the relations of its best rule, and how much they reach. */
  best: Match | null;
  /** Lines that took a relation this one had a claim to. */
  lostTo: string[];
}

export interface Matched {
  /** In the seasonal step's order, which is by id. */
  lines: MatchedLine[];
  /** Ordered by id. */
  unmatched: Unmatched[];
  /** How many lines each rule matched. */
  byRule: Record<Rule, number>;
  /** Relations no line took, disused ones aside. */
  unused: number;
  /** One hash over every line's match and geometry, to compare two runs by. */
  fingerprint: string;
}

export interface MatchInput {
  lines: readonly SeasonalLine[];
  relations: readonly OsmRelation[];
  /** For the positions of a feed line's stations. */
  stations: readonly Station[];
  /** For the short form of an operator, which is how OSM mostly spells it. */
  operators: readonly Operator[];
}

type Log = (message: string) => void;

interface Box {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** A relation, read once into what the rules ask of it. */
interface Candidate {
  id: number;
  /** A diversion or positioning run, which only counts where nothing regular does. */
  alternate: boolean;
  operator: string | undefined;
  refs: Set<string>;
  ways: Way[];
  parts: OsmPoint[][];
  /** Its stops at Swiss stations, in member order, or the ends of its track when it has no stops. */
  anchors: LatLon[];
  /** The first and last of its anchors. */
  ends: [LatLon, LatLon] | null;
  box: Box;
}

/** A line, read once into what the rules check a relation against. */
interface Target {
  line: SeasonalLine;
  tolerance: number;
  positions: LatLon[];
  terminals: [LatLon, LatLon] | null;
  refs: Set<string>;
  operators: string[];
}

/** One relation a rule nominated for a line and the line's stations it reaches. */
interface Option {
  relation: number;
  rule: Rule;
  /** The relation `ref` that named the line, for the ref rule. */
  ref: string | null;
  alternate: boolean;
  reaches: Set<number>;
}

interface Claim {
  rule: Rule;
  options: Option[];
  coverage: number;
  accepted: boolean;
}

function count(value: number): string {
  return value.toLocaleString('en-US');
}

function plural(value: number, noun: string): string {
  return `${count(value)} ${value === 1 ? noun : `${noun}s`}`;
}

function sample(ids: readonly string[]): string {
  return `${ids.slice(0, SHOWN).join(', ')}${ids.length > SHOWN ? ', …' : ''}`;
}

function boxOf(points: readonly LatLon[]): Box {
  return points.reduce(
    (box, { lat, lon }) => ({
      south: Math.min(box.south, lat),
      west: Math.min(box.west, lon),
      north: Math.max(box.north, lat),
      east: Math.max(box.east, lon),
    }),
    { south: Infinity, west: Infinity, north: -Infinity, east: -Infinity },
  );
}

/** Generous by a kilometre, which is more than any tolerance, at Swiss latitudes. */
function inBox(box: Box, { lat, lon }: LatLon): boolean {
  const margin = 0.015;

  return (
    lat >= box.south - margin &&
    lat <= box.north + margin &&
    lon >= box.west - margin &&
    lon <= box.east + margin
  );
}

function isStop(role: string): boolean {
  return role === 'stop' || role.startsWith('stop_');
}

function isTrack(role: string): boolean {
  return !role.startsWith('platform');
}

/**
 * Whether a point is at one of the Swiss stations, through a grid of cells a
 * hundredth of a degree on a side: a kilometre north to south and about 750
 * metres east to west here. So the cell a point is in and the eight around it
 * hold every station within the largest tolerance.
 */
function stationGrid(stations: readonly LatLon[]): (point: LatLon, tolerance: number) => boolean {
  const cell = (lat: number, lon: number): string => `${Math.floor(lat * 100)},${Math.floor(lon * 100)}`;
  const cells = new Map<string, LatLon[]>();

  for (const station of stations) {
    const key = cell(station.lat, station.lon);
    cells.set(key, [...(cells.get(key) ?? []), station]);
  }

  return (point, tolerance) =>
    [-1, 0, 1].some(dLat =>
      [-1, 0, 1].some(dLon =>
        (cells.get(cell(point.lat + dLat / 100, point.lon + dLon / 100)) ?? []).some(station =>
          near(point, station, tolerance),
        ),
      ),
    );
}

/**
 * A stop counts only at a Swiss station. The EC to Milano and the TILO lines to
 * Varese and Como have more stops abroad than at home, and the line they are
 * matched to only has the Swiss ones; a box around Switzerland would still
 * count Como, Varese and Konstanz as home.
 */
function toCandidate(
  relation: OsmRelation,
  atStation: (point: LatLon, tolerance: number) => boolean,
): Candidate {
  const ways: Way[] = relation.members.flatMap(member =>
    member.type === 'way' && isTrack(member.role) && member.geometry !== undefined
      ? [{ id: member.ref, points: member.geometry }]
      : [],
  );
  const parts = linemerge(ways);
  const stops = relation.members.flatMap(member =>
    member.type === 'node' &&
    isStop(member.role) &&
    member.lat !== undefined &&
    member.lon !== undefined
      ? [{ lat: member.lat, lon: member.lon }]
      : [],
  );
  const tolerance = TOLERANCE_M[relation.route];
  const anchors =
    stops.length > 0
      ? stops.filter(stop => atStation(stop, tolerance))
      : parts.flatMap(part => [part[0], part.at(-1)].filter(point => point !== undefined));
  const first = anchors[0];
  const last = anchors.at(-1);

  return {
    id: relation.id,
    alternate: isAlternate(relation.tags),
    operator: relation.tags.operator,
    refs: relationRefs(relation.tags.ref),
    ways,
    parts,
    anchors,
    ends: first === undefined || last === undefined ? null : [first, last],
    box: boxOf([...parts.flat(), ...anchors]),
  };
}

/**
 * The two ends of the trunk: its first stop and its last before the branch
 * blocks, which follow it. A hand-written line's are its first and last stop.
 */
function terminalsOf(line: SeasonalLine, positions: ReadonlyMap<string, LatLon>): [LatLon, LatLon] | null {
  if (line.source === 'manual') {
    const [first, last] = [line.stops[0], line.stops.at(-1)];
    return first === undefined || last === undefined ? null : [first, last];
  }

  const branchAt = line.sequence.findIndex(stop => stop.via === 'branch');
  const trunk = branchAt === -1 ? line.sequence : line.sequence.slice(0, branchAt);
  const first = positions.get(trunk[0]?.didok ?? '');
  const last = positions.get(trunk.at(-1)?.didok ?? '');

  return first === undefined || last === undefined ? null : [first, last];
}

function toTarget(
  line: SeasonalLine,
  positions: ReadonlyMap<string, LatLon>,
  operators: readonly Operator[],
): Target {
  return {
    line,
    tolerance: TOLERANCE_M[routeTypeOf(line.category)],
    positions:
      line.source === 'manual'
        ? line.stops.map(({ lat, lon }) => ({ lat, lon }))
        : line.stations.flatMap(didok => positions.get(didok) ?? []),
    terminals: terminalsOf(line, positions),
    refs: lineRefs(line.category, line.number),
    operators: operatorNames(line.operators, operators),
  };
}

function near(a: LatLon, b: LatLon, tolerance: number): boolean {
  return metres(a, b) <= tolerance;
}

function endsAtTerminals(target: Target, candidate: Candidate): boolean {
  const { terminals, tolerance } = target;
  const { ends } = candidate;

  if (terminals === null || ends === null) {
    return false;
  }

  const [a, b] = ends;
  const [x, y] = terminals;

  return (
    (near(a, x, tolerance) && near(b, y, tolerance)) ||
    (near(a, y, tolerance) && near(b, x, tolerance))
  );
}

/**
 * The strongest rule that nominates `candidate` for `target`, or `null`. A
 * relation whose `ref` is some other line's is that line's, and only the ref
 * rule may hand it out: `knownRefs` is every number a line in the input has,
 * and `namesAnotherLine` covers the lines OSM numbers and the feed does not.
 */
function nominate(
  target: Target,
  candidate: Candidate,
  knownRefs: ReadonlySet<string>,
): { rule: Rule; ref: string | null } | null {
  const ref = [...candidate.refs].sort(compare).find(value => target.refs.has(value));

  if (ref !== undefined) {
    return { rule: 'ref', ref };
  }

  if (
    [...candidate.refs].some(value => knownRefs.has(value)) ||
    namesAnotherLine(candidate.refs, target.line.category, target.line.number) ||
    !endsAtTerminals(target, candidate)
  ) {
    return null;
  }

  return {
    rule: operatorMatches(candidate.operator, target.operators) ? 'operator' : 'endpoints',
    ref: null,
  };
}

/** The share of the relation's anchors that are at one of the line's stations. */
function precision(target: Target, candidate: Candidate): number {
  if (candidate.anchors.length === 0) {
    return 0;
  }

  const at = candidate.anchors.filter(anchor =>
    target.positions.some(position => near(anchor, position, target.tolerance)),
  );

  return at.length / candidate.anchors.length;
}

/** The indexes of the line's stations that the relation's track passes. */
function reaches(target: Target, candidate: Candidate): Set<number> {
  return new Set(
    target.positions.flatMap((position, index) =>
      inBox(candidate.box, position) && metresToLines(position, candidate.parts) <= target.tolerance
        ? [index]
        : [],
    ),
  );
}

function optionsFor(
  target: Target,
  candidates: readonly Candidate[],
  knownRefs: ReadonlySet<string>,
): Option[] {
  if (target.positions.length === 0) {
    return [];
  }

  return candidates.flatMap(candidate => {
    if (
      candidate.parts.length === 0 ||
      !target.positions.some(position => inBox(candidate.box, position))
    ) {
      return [];
    }

    const nominated = nominate(target, candidate, knownRefs);

    if (nominated === null || precision(target, candidate) < MIN_PRECISION) {
      return [];
    }

    return [
      {
        relation: candidate.id,
        ...nominated,
        alternate: candidate.alternate,
        reaches: reaches(target, candidate),
      },
    ];
  });
}

function claimFrom(target: Target, rule: Rule, nominated: Option[]): Claim {
  const reached = new Set(nominated.flatMap(option => [...option.reaches]));
  const coverage = reached.size / target.positions.length;

  return { rule, options: nominated, coverage, accepted: coverage >= MIN_COVERAGE };
}

/**
 * The line's claim: the first rule whose nominations, less the relations it has
 * lost, reach enough of it — its regular relations if they do, and with the
 * alternates added only if they do not. When no rule does, the one that came
 * nearest, for the report.
 */
function claimOf(
  target: Target,
  options: readonly Option[],
  lost: ReadonlySet<number>,
): Claim | null {
  let nearest: Claim | null = null;

  for (const rule of RULES) {
    const nominated = options.filter(option => option.rule === rule && !lost.has(option.relation));
    const regular = nominated.filter(option => !option.alternate);
    const tries = regular.length === nominated.length ? [nominated] : [regular, nominated];

    for (const attempt of tries.filter(options => options.length > 0)) {
      const claim = claimFrom(target, rule, attempt);

      if (claim.accepted) {
        return claim;
      }

      if (nearest === null || claim.coverage > nearest.coverage) {
        nearest = claim;
      }
    }
  }

  return nearest;
}

/** Strongest rule, then the most of the line reached, then the lower id. */
function strongerFirst(
  a: { target: Target; claim: Claim },
  b: { target: Target; claim: Claim },
): number {
  return (
    RULES.indexOf(a.claim.rule) - RULES.indexOf(b.claim.rule) ||
    b.claim.coverage - a.claim.coverage ||
    compare(a.target.line.id, b.target.line.id)
  );
}

/**
 * Hands every contested relation to the strongest claim on it, and takes it off
 * the others, until no relation is claimed twice. Losing a relation can drop a
 * line to a weaker rule, which can make it a contender somewhere else, so it is
 * run until nothing changes. Relations only ever leave a claim, so it ends.
 */
function resolve(
  targets: readonly Target[],
  options: ReadonlyMap<string, Option[]>,
): { claims: Map<string, Claim | null>; lostTo: Map<string, Set<string>> } {
  const lost = new Map(targets.map(target => [target.line.id, new Set<number>()]));
  const lostTo = new Map(targets.map(target => [target.line.id, new Set<string>()]));

  for (;;) {
    const claims = new Map(
      targets.map(target => [
        target.line.id,
        claimOf(target, options.get(target.line.id) ?? [], lost.get(target.line.id) ?? new Set()),
      ]),
    );
    const claimants = new Map<number, { target: Target; claim: Claim; ref: string | null }[]>();

    for (const target of targets) {
      const claim = claims.get(target.line.id);

      if (claim?.accepted !== true) {
        continue;
      }

      for (const option of claim.options) {
        claimants.set(option.relation, [
          ...(claimants.get(option.relation) ?? []),
          { target, claim, ref: option.ref },
        ]);
      }
    }

    let changed = false;

    for (const [relation, contenders] of claimants) {
      const kept: { target: Target; ref: string | null }[] = [];

      for (const contender of [...contenders].sort(strongerFirst)) {
        const shares =
          kept.length === 0 ||
          (contender.ref !== null && kept.every(holder => holder.ref !== null && holder.ref !== contender.ref));

        if (shares) {
          kept.push(contender);
          continue;
        }

        lost.get(contender.target.line.id)?.add(relation);

        for (const holder of kept) {
          lostTo.get(contender.target.line.id)?.add(holder.target.line.id);
        }

        changed = true;
      }
    }

    if (!changed) {
      return { claims, lostTo };
    }
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function matchOf(claim: Claim): Match {
  return {
    rule: claim.rule,
    confidence: round(claim.coverage),
    relations: claim.options.map(option => option.relation).sort((a, b) => a - b),
  };
}

function geometryOf(relations: readonly number[], byId: ReadonlyMap<number, Candidate>): Geometry {
  const ways = relations.flatMap(id => byId.get(id)?.ways ?? []);

  return {
    type: 'MultiLineString',
    coordinates: linemerge(ways).map(part => part.map(({ lat, lon }): [number, number] => [lon, lat])),
  };
}

function fingerprintOf(lines: readonly MatchedLine[]): string {
  const hash = createHash('sha256');

  for (const line of lines) {
    hash.update(
      line.match === null
        ? `${line.id}|-`
        : [
            line.id,
            line.match.rule,
            line.match.confidence,
            line.match.relations.join(' '),
            line.geometry.coordinates.map(part => part.length).join(' '),
          ].join('|'),
    );
    hash.update('\n');
  }

  return hash.digest('hex').slice(0, 16);
}

export function matchLines(input: MatchInput, log: Log): Matched {
  const positions = new Map(
    input.stations.flatMap(({ didok, lat, lon }): [string, LatLon][] =>
      lat === null || lon === null ? [] : [[didok, { lat, lon }]],
    ),
  );
  const atStation = stationGrid([...positions.values()]);
  const candidates = input.relations
    .filter(relation => !isDisused(relation.tags))
    .map(relation => toCandidate(relation, atStation));
  const byId = new Map(candidates.map(candidate => [candidate.id, candidate]));
  const targets = input.lines.map(line => toTarget(line, positions, input.operators));
  const knownRefs = new Set(targets.flatMap(target => [...target.refs]));
  const options = new Map(
    targets.map(target => [target.line.id, optionsFor(target, candidates, knownRefs)]),
  );
  const { claims, lostTo } = resolve(targets, options);

  const unmatched: Unmatched[] = [];
  const byRule: Record<Rule, number> = { ref: 0, operator: 0, endpoints: 0 };
  const taken = new Set<number>();

  const lines = targets.map(({ line }): MatchedLine => {
    const claim = claims.get(line.id) ?? null;
    const lostToIds = [...(lostTo.get(line.id) ?? [])].sort(compare);

    if (claim?.accepted === true) {
      const match = matchOf(claim);
      byRule[match.rule] += 1;
      match.relations.forEach(id => taken.add(id));

      return { ...line, hasGeometry: true, geometry: geometryOf(match.relations, byId), match };
    }

    const hadOptions = (options.get(line.id)?.length ?? 0) > 0;

    unmatched.push({
      id: line.id,
      name: line.name,
      reason: !hadOptions ? 'no-candidate' : lostToIds.length > 0 ? 'contested' : 'low-coverage',
      best: claim === null ? null : matchOf(claim),
      lostTo: lostToIds,
    });

    return { ...line, hasGeometry: false, geometry: null, match: null };
  });

  for (const line of lines) {
    // The one promise downstream relies on: a line says it has a shape exactly
    // when it has one, and a shape is never empty.
    if (line.hasGeometry !== (line.geometry !== null) || line.geometry?.coordinates.length === 0) {
      throw new Error(`line ${line.id} came out with has_geometry ${line.hasGeometry} and a geometry that disagrees; this is a bug in match.ts`);
    }
  }

  const fingerprint = fingerprintOf([...lines].sort((a, b) => compare(a.id, b.id)));
  const unused = candidates.filter(candidate => !taken.has(candidate.id)).length;
  const matched = lines.length - unmatched.length;

  log(
    `${plural(matched, 'line')} of ${count(lines.length)} matched to OSM relations — ${RULES.map(rule => `${count(byRule[rule])} by ${rule}`).join(', ')} — and ${count(unmatched.length)} with no geometry; ${plural(unused, 'relation')} of ${count(candidates.length)} still in use matched no line; fingerprint ${fingerprint}`,
  );

  for (const reason of ['no-candidate', 'low-coverage', 'contested'] as const) {
    const ids = unmatched.filter(entry => entry.reason === reason).map(entry => entry.id);

    if (ids.length > 0) {
      log(`${plural(ids.length, 'line')} unmatched, ${reason}: ${sample(ids)}`);
    }
  }

  return { lines, unmatched, byRule, unused, fingerprint };
}
