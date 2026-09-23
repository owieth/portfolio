/**
 * Joining a relation's member ways into as few line strings as they allow — the
 * job `shapely.ops.linemerge` does, which has no TypeScript equivalent.
 *
 * OSM maps a line as dozens or hundreds of ways, each a stretch of track between
 * two junctions, a bridge, or wherever a mapper last split it. They come in
 * member order, which is usually but not always running order, and each in its
 * own direction. Drawn as they are, the line is fine on a map and useless to
 * anything that walks it. So they are joined wherever two of them meet end to
 * end and nothing else meets there:
 *
 * - Ways meet where an end of one has exactly the coordinates of an end of the
 *   other. Two ways sharing an OSM node share its coordinates to the last digit,
 *   because Overpass prints the node, not a rounding of it.
 * - A way is reversed when that is what it takes to join it.
 * - A node where three or more ways end is a junction and joins nothing: a
 *   branch comes out as three strings, never as one that doubles back.
 * - A gap — two ways that do not touch, because the mapping is incomplete or
 *   the line runs over a stretch mapped in another relation — is not bridged.
 *   Each side is its own string, and the line is a MultiLineString with a hole
 *   in it rather than a straight segment across a lake.
 * - A way that appears twice, in two per-direction relations or twice in one,
 *   is used once.
 *
 * The strings come out in the order their first way appears, each running the
 * way its first way does, so the same members give the same geometry every run.
 */

import type { OsmPoint } from '../overpass.ts';

export interface Way {
  /** The OSM way id, which is what identifies a way used by two relations. */
  id: number;
  points: readonly OsmPoint[];
}

type Key = string;

interface Edge {
  points: readonly OsmPoint[];
  start: Key;
  end: Key;
}

function keyOf({ lat, lon }: OsmPoint): Key {
  return `${lat},${lon}`;
}

function unique(ways: readonly Way[]): Edge[] {
  const seen = new Set<number>();
  const edges: Edge[] = [];

  for (const way of ways) {
    const points = way.points.filter(
      point => Number.isFinite(point?.lat) && Number.isFinite(point?.lon),
    );

    if (seen.has(way.id) || points.length < 2) {
      continue;
    }

    seen.add(way.id);
    edges.push({
      points,
      start: keyOf(points[0] as OsmPoint),
      end: keyOf(points.at(-1) as OsmPoint),
    });
  }

  return edges;
}

export function linemerge(ways: readonly Way[]): OsmPoint[][] {
  const edges = unique(ways);
  const atNode = new Map<Key, number[]>();

  edges.forEach((edge, index) => {
    for (const node of [edge.start, edge.end]) {
      atNode.set(node, [...(atNode.get(node) ?? []), index]);
    }
  });

  const used = new Set<number>();

  /**
   * The next unused edge through `node`, if `node` joins exactly two edge ends.
   * A closed way counts both of its ends, so a ring on its own has nothing to
   * continue into.
   */
  const next = (node: Key): number | null => {
    const through = atNode.get(node) ?? [];

    if (through.length !== 2) {
      return null;
    }

    const found = through.find(index => !used.has(index));
    return found ?? null;
  };

  const parts: OsmPoint[][] = [];

  edges.forEach((first, firstIndex) => {
    if (used.has(firstIndex)) {
      return;
    }

    used.add(firstIndex);
    const part = [...first.points];

    // Forward from the first way's end, then backward from its start, so the
    // string runs the way its first member does.
    for (let node = first.end, index = next(node); index !== null; index = next(node)) {
      const edge = edges[index] as Edge;
      const forward = edge.start === node;

      used.add(index);
      part.push(...(forward ? edge.points : [...edge.points].reverse()).slice(1));
      node = forward ? edge.end : edge.start;
    }

    for (let node = first.start, index = next(node); index !== null; index = next(node)) {
      const edge = edges[index] as Edge;
      const forward = edge.end === node;

      used.add(index);
      part.unshift(...(forward ? edge.points : [...edge.points].reverse()).slice(0, -1));
      node = forward ? edge.start : edge.end;
    }

    parts.push(part);
  });

  return parts;
}
