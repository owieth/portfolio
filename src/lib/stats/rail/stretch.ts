import type { Feature, MultiLineString, Position } from 'geojson';

import type { LatLon } from '@/lib/geo/ch';
import type { RailRideCoverage, RailStop } from '@/lib/stats/rail/types';

/**
 * The part of a line's geometry a ride went over, for the map. Pure, like the
 * rest of this folder, and run on the server: `/stats` slices once per render
 * rather than every browser once per visit.
 *
 * The geometry is `public/rail/lines.geojson`, a `MultiLineString` per line.
 * Its parts are not one ordered run. A junction where three ways meet ends
 * every part touching it, so a branch is a part of its own, sharing an
 * endpoint with the two trunk parts either side of it. Each part also runs
 * whichever way its first OSM way did, so nothing about a part's direction
 * says anything about the stops. Hence a graph, not an index into one array.
 */

/**
 * How far a stop may sit from its line's geometry and still be placed on it.
 * The train tolerance the pipeline matched the geometry with, in
 * `rail/src/match.ts`, so a stop the match accepted is never rejected here.
 */
export const OFF_LINE_M = 500;

/**
 * How close two part ends have to be to count as one junction. The
 * simplification keeps every endpoint, so at a real junction they coincide;
 * this only absorbs the rounding. A wider gap is one OSM has not mapped, and
 * is not bridged, the same as `rail/src/match/linemerge.ts` leaves it.
 */
export const JOIN_M = 50;

/** The IUGG mean radius, as in `rail/src/match/geo.ts`. */
const EARTH_RADIUS_M = 6_371_008.8;

const RADIANS = Math.PI / 180;

/** The precision of `lines.geojson`, so a cut point is no finer than the rest. */
const PRECISION = 1e5;

export type RailStretch = Feature<MultiLineString, { id: string }>;

export type Slice =
  | { ok: true; coordinates: Position[][] }
  | { ok: false; reason: string };

type Plane = (position: Position) => [number, number];

/**
 * Metres on a plane tangent at `origin`, for the reason `rail/src/match/geo.ts`
 * gives: exact enough over a ride, and everything asked of it is "nearest".
 */
function planeAt({ lat, lon }: LatLon): Plane {
  const scaleY = EARTH_RADIUS_M * RADIANS;
  const scaleX = scaleY * Math.cos(lat * RADIANS);

  return ([x, y]) => [(x - lon) * scaleX, (y - lat) * scaleY];
}

const round = (value: number) => Math.round(value * PRECISION) / PRECISION;

/** Where on the geometry a stop lands: a point on one segment of one part. */
interface Snap {
  part: number;
  segment: number;
  metres: number;
  position: Position;
}

function snap(parts: Position[][], plane: Plane, point: LatLon): Snap | null {
  const [px, py] = plane([point.lon, point.lat]);
  let best: Snap | null = null;

  for (const [partIndex, part] of parts.entries()) {
    for (let index = 1; index < part.length; index += 1) {
      const a = part[index - 1];
      const b = part[index];
      const [ax, ay] = plane(a);
      const [bx, by] = plane(b);
      const dx = bx - ax;
      const dy = by - ay;
      const length = dx * dx + dy * dy;
      const t =
        length === 0
          ? 0
          : Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / length));
      const metres = Math.hypot(ax + t * dx - px, ay + t * dy - py);

      if (best && best.metres <= metres) continue;

      best = {
        part: partIndex,
        segment: index - 1,
        metres,
        position: [
          round(a[0] + t * (b[0] - a[0])),
          round(a[1] + t * (b[1] - a[1])),
        ],
      };
    }
  }

  return best;
}

/** A step between two nodes. A `join` crosses from one part to another. */
interface Edge {
  to: number;
  metres: number;
  join: boolean;
}

/**
 * The geometry between two stops, as runs of track: one per part the ride
 * crossed, in the order it crossed them. Either stop order gives the same
 * track, walked the other way.
 *
 * Each stop is placed on every part near it, and the cut runs along the
 * shortest way between the two over the parts and their junctions. Not
 * `toCoverage`'s walk over the stops: two stops only fix the ends, and the
 * shortest track between them is the one a train takes, down a trunk and its
 * branches or along one track of a double-track line.
 *
 * Every part near it, not only the nearest: a double-track line is two
 * parallel parts that meet only at the termini, and a stop placed on one track
 * alone reaches a stop placed on the other only by way of a terminus. Near is
 * at most `JOIN_M` farther off than the nearest part: parallel tracks are
 * metres apart, and any wider would let a stop start down a branch it is not
 * on.
 */
export function sliceLine(
  parts: Position[][],
  from: LatLon,
  to: LatLon,
): Slice {
  const plane = planeAt({
    lat: (from.lat + to.lat) / 2,
    lon: (from.lon + to.lon) / 2,
  });
  const candidates: Snap[][] = [];

  for (const [index, point] of [from, to].entries()) {
    const which = index === 0 ? 'from' : 'to';
    const snaps = parts.flatMap((part, partIndex) => {
      const placed = snap([part], plane, point);

      return placed ? [{ ...placed, part: partIndex }] : [];
    });

    if (snaps.length === 0) {
      return { ok: false, reason: 'the line has no geometry' };
    }

    const best = snaps.reduce((nearest, placed) =>
      placed.metres < nearest.metres ? placed : nearest,
    );

    if (best.metres > OFF_LINE_M) {
      return {
        ok: false,
        reason: `the ${which} stop is ${Math.round(best.metres)} m off the line`,
      };
    }

    const reach = Math.min(OFF_LINE_M, best.metres + JOIN_M);

    candidates.push(snaps.filter(({ metres }) => metres <= reach));
  }

  const [starts, ends] = candidates;
  const positions: Position[] = [];
  const offsets: number[] = [];

  for (const part of parts) {
    offsets.push(positions.length);
    positions.push(...part);
  }

  const source = positions.push([from.lon, from.lat]) - 1;
  const sink = positions.push([to.lon, to.lat]) - 1;
  const startNodes = starts.map(({ position }) => positions.push(position) - 1);
  const endNodes = ends.map(({ position }) => positions.push(position) - 1);
  const edges: Edge[][] = positions.map(() => []);
  const distance = (a: number, b: number) => {
    const [ax, ay] = plane(positions[a]);
    const [bx, by] = plane(positions[b]);

    return Math.hypot(bx - ax, by - ay);
  };
  const link = (
    a: number,
    b: number,
    join = false,
    metres = distance(a, b),
  ) => {
    edges[a].push({ to: b, metres, join });
    edges[b].push({ to: a, metres, join });
  };

  for (const [partIndex, part] of parts.entries()) {
    for (let index = 1; index < part.length; index += 1) {
      link(offsets[partIndex] + index - 1, offsets[partIndex] + index);
    }
  }

  const partEnds = parts.flatMap((part, partIndex) =>
    part.length === 0
      ? []
      : [offsets[partIndex], offsets[partIndex] + part.length - 1],
  );

  for (const [index, a] of partEnds.entries()) {
    for (const b of partEnds.slice(index + 1)) {
      if (a !== b && distance(a, b) <= JOIN_M) link(a, b, true);
    }
  }

  for (const [stop, snaps, nodes] of [
    [source, starts, startNodes],
    [sink, ends, endNodes],
  ] as const) {
    for (const [index, { part, segment, metres }] of snaps.entries()) {
      link(stop, nodes[index], false, metres);
      link(nodes[index], offsets[part] + segment);
      link(nodes[index], offsets[part] + segment + 1);
    }
  }

  for (const [startIndex, start] of starts.entries()) {
    for (const [endIndex, end] of ends.entries()) {
      if (start.part === end.part && start.segment === end.segment) {
        link(startNodes[startIndex], endNodes[endIndex]);
      }
    }
  }

  const path = shortestPath(edges, source, sink);

  if (!path) {
    return { ok: false, reason: 'nothing connects the two stops on the line' };
  }

  const runs: Position[][] = [[positions[path[0].node]]];

  for (const { node, join } of path.slice(1, -1)) {
    const position = positions[node];
    const run = runs[runs.length - 1];
    const last = run[run.length - 1];

    if (join) runs.push([position]);
    else if (last[0] !== position[0] || last[1] !== position[1]) {
      run.push(position);
    }
  }

  const coordinates = runs.filter((run) => run.length > 1);

  if (coordinates.length === 0) {
    return { ok: false, reason: 'both stops land on the same point' };
  }

  return { ok: true, coordinates };
}

/**
 * Dijkstra, the steps after `from` up to and including `to`, or null when no
 * edge leads there. The frontier is scanned rather than heaped: a line's
 * geometry is a few hundred points, and the frontier of a tree a handful.
 */
function shortestPath(
  edges: Edge[][],
  from: number,
  to: number,
): { node: number; join: boolean }[] | null {
  const metres = new Map<number, number>([[from, 0]]);
  const cameFrom = new Map<number, { node: number; join: boolean }>();
  const done = new Set<number>();
  const frontier = new Set([from]);

  while (frontier.size > 0) {
    let at = -1;

    for (const node of frontier) {
      if (at === -1 || (metres.get(node) ?? 0) < (metres.get(at) ?? 0)) {
        at = node;
      }
    }

    frontier.delete(at);
    done.add(at);

    if (at === to) break;

    for (const edge of edges[at]) {
      if (done.has(edge.to)) continue;

      const via = (metres.get(at) ?? 0) + edge.metres;

      if (via < (metres.get(edge.to) ?? Infinity)) {
        metres.set(edge.to, via);
        cameFrom.set(edge.to, { node: at, join: edge.join });
        frontier.add(edge.to);
      }
    }
  }

  if (!done.has(to)) return null;

  const path: { node: number; join: boolean }[] = [];

  for (let node = to; node !== from; ) {
    const step = cameFrom.get(node);

    if (!step) return null;

    path.push({ node, join: step.join });
    node = step.node;
  }

  return path.reverse();
}

/** The rides over one stretch of one line, whichever way each went. */
interface Ridden {
  first: RailRideCoverage;
  fromDidok: string;
  toDidok: string;
  rides: number;
}

const skip = ({ first: { ride }, rides }: Ridden, reason: string) =>
  console.warn(
    `[stats/rail] skipping the stretch of ride ${ride.id} on ${ride.riddenOn}${rides > 1 ? ` and ${rides - 1} more` : ''}: ${reason}`,
  );

/**
 * Segment rides to the track they covered, for the map to draw over the muted
 * network: one feature per stretch, however often and whichever way it was
 * ridden. A stretch is a line and two stops, cut in the stops' sorted order so
 * the track does not depend on which ride came first, and the features follow
 * the order their stretches first appear in. A whole-line ride has no
 * stretch: the map draws the line's own feature, which `wholeLineIds` names.
 *
 * Off the coverage, so every ride here already resolved against its line and
 * its stops. What can still go wrong is the geometry: a stop with no position,
 * a line with no feature, a stop too far from its track, or two stops on parts
 * nothing joins. Each drops the stretch with one warning, naming its first
 * ride and how many more, the same as `toCoverage` drops a ride. The rides
 * still count towards the line's share.
 *
 * A Didok number listed twice on a line places the first stop to list it, the
 * same one `toCoverage` walks from.
 */
export function rideStretches(
  coverage: RailRideCoverage[],
  stops: RailStop[],
  geometry: ReadonlyMap<string, Position[][]>,
): RailStretch[] {
  const positions = new Map<string, LatLon | null>();

  for (const { lineId, didok, lat, lon } of stops) {
    const key = `${lineId} ${didok}`;

    if (didok === null || positions.has(key)) continue;

    positions.set(key, lat === null || lon === null ? null : { lat, lon });
  }

  const byStretch = new Map<string, Ridden>();

  for (const entry of coverage) {
    const { ride, line } = entry;

    if (ride.fromDidok === null || ride.toDidok === null) continue;

    const [fromDidok, toDidok] = [ride.fromDidok, ride.toDidok].sort();
    const key = `${line.id} ${fromDidok} ${toDidok}`;
    const known = byStretch.get(key);

    if (known) known.rides += 1;
    else byStretch.set(key, { first: entry, fromDidok, toDidok, rides: 1 });
  }

  const stretches: RailStretch[] = [];

  for (const ridden of byStretch.values()) {
    const { line } = ridden.first;
    const { fromDidok, toDidok } = ridden;
    const from = positions.get(`${line.id} ${fromDidok}`);
    const to = positions.get(`${line.id} ${toDidok}`);

    if (!from || !to) {
      const unplaced = [!from && fromDidok, !to && toDidok]
        .filter(Boolean)
        .join(', ');

      skip(ridden, `${unplaced} has no position`);
      continue;
    }

    const parts = geometry.get(line.id);

    if (!parts) {
      skip(ridden, `${line.id} has no geometry`);
      continue;
    }

    const slice = sliceLine(parts, from, to);

    if (!slice.ok) {
      skip(ridden, `${fromDidok} → ${toDidok}: ${slice.reason}`);
      continue;
    }

    stretches.push({
      type: 'Feature',
      geometry: { type: 'MultiLineString', coordinates: slice.coordinates },
      properties: { id: line.id },
    });
  }

  return stretches;
}

/**
 * The lines at least one ride went the whole length of, once each. These the
 * map draws as before, feature and all, whatever else was ridden on them.
 */
export function wholeLineIds(coverage: RailRideCoverage[]): string[] {
  return [
    ...new Set(
      coverage
        .filter(({ ride }) => ride.fromDidok === null && ride.toDidok === null)
        .map(({ line }) => line.id),
    ),
  ];
}
