/**
 * How a line's stop patterns become one ordered list of stops, as pure functions
 * over values.
 *
 * They live apart from the step so each rule can be tested on its own, with
 * nothing but arrays. The rules are the answer to "where does this stop go", and
 * each of the awkward cases — a branch, a branch that rejoins, a stop only a
 * short-turn serves, two patterns that disagree about order — has one written
 * down here rather than falling out of a sort:
 *
 * 1. The line's patterns are pooled across its routes by hash and ranked by how
 *    often they run.
 * 2. The **backbone** is the most common longest pattern, turned so its lower
 *    Didok terminal comes first — the same rule the merge step's terminals use.
 *    It is the trunk the rest is placed against.
 * 3. Every other pattern, in rank order, is turned to agree with the stops
 *    already placed, and each run of stops it serves that are not placed yet is
 *    inserted next to the placed stops either side of it:
 *    - between two placed stops of the trunk — a **detour**, which is also
 *      what a stop the backbone skips looks like. It goes straight between
 *      them when they are adjacent. Otherwise it goes in the gap where it adds
 *      the least distance, and just before the stop it rejoins at when that
 *      cannot be told;
 *    - off the end of the trunk, as an **extension** of it;
 *    - off anywhere else, as a **branch**: a block of its own, listed after the
 *      trunk and read outward from the stop it leaves at, its **junction**.
 * 4. The order already placed is never changed. A pattern that runs placed stops
 *    in another order is recorded as a conflict and loses to the one that runs
 *    more; its new stops hang off the last placed stop before them.
 * 5. A station a pattern comes back to later — a loop — keeps its first visit.
 *
 * Every comparison is by code unit, through the merge step's `compare`, so two
 * runs over the same feed give every line the same sequence.
 */

import { compare } from '../merge/key.ts';
import type { Pattern } from '../patterns.ts';

/**
 * How a stop got into the sequence.
 *
 * - `backbone` — served by the most common longest pattern.
 * - `extension` — beyond one end of the trunk, hanging off that end.
 * - `detour` — between two trunk stops, in the gap `detourGap` picks.
 * - `branch` — in a block of its own after the trunk.
 */
export type Via = 'backbone' | 'extension' | 'detour' | 'branch';

export interface SequenceStop {
  didok: string;
  via: Via;
  /**
   * The placed stop it was inserted against: the stop a detour leaves the trunk
   * at, the end an extension continues, the stop a branch block leaves from.
   * `null` on the backbone, and on a block that shares no stop with the line.
   */
  junction: string | null;
}

/** A pattern pooled across the line's routes: one hash, counts summed. */
export type PooledPattern = Omit<Pattern, 'routeId'>;

export interface LinePattern extends PooledPattern {
  /** Whether it runs against the sequence rather than along it. */
  reversed: boolean;
}

export interface Sequence {
  /** The trunk in order, then every branch block in the order it was found. */
  stops: SequenceStop[];
  /** Every pattern of the line, busiest first. */
  patterns: LinePattern[];
  /** Hashes of the patterns that run placed stops in another order. */
  conflicts: string[];
  /** Whether any pattern visits one station twice. */
  loop: boolean;
}

type Orientation = 'forward' | 'reverse';

/** One contiguous block of the sequence; the first is the trunk. */
interface Segment {
  junction: string | null;
  stops: SequenceStop[];
}

interface Place {
  segment: number;
  index: number;
}

interface Layout {
  segments: Segment[];
  places: Map<string, Place>;
  positions: ReadonlyMap<string, Position>;
}

export interface Position {
  lat: number;
  lon: number;
}

/** Runs most, then most trips, then lowest hash — total, so ties break the same way every run. */
export function compareRank(a: PooledPattern, b: PooledPattern): number {
  return b.runs - a.runs || b.trips - a.trips || compare(a.hash, b.hash);
}

/**
 * The line's patterns with the route taken out: two routes of one line that run
 * the same stops — two operators, two timetable variants — are one pattern with
 * both counts. Busiest first.
 */
export function poolPatterns(patterns: readonly Pattern[]): PooledPattern[] {
  const byHash = new Map<string, PooledPattern>();

  for (const { hash, stations, trips, runs } of patterns) {
    const seen = byHash.get(hash);

    byHash.set(
      hash,
      seen === undefined
        ? { hash, stations: [...stations], trips, runs }
        : { ...seen, trips: seen.trips + trips, runs: seen.runs + runs },
    );
  }

  return [...byHash.values()].sort(compareRank);
}

/**
 * The most common longest pattern: the most stations, then the busiest. Longest
 * first, because the backbone is what every other stop is placed against, and a
 * short-turn that runs more often would leave more of the line to insert.
 */
export function backbone(pool: readonly PooledPattern[]): PooledPattern | null {
  return (
    [...pool].sort(
      (a, b) => new Set(b.stations).size - new Set(a.stations).size || compareRank(a, b),
    )[0] ?? null
  );
}

/** The stations of a pattern with every revisit dropped, and whether there was one. */
export function firstVisits(stations: readonly string[]): { stations: string[]; loop: boolean } {
  const kept = [...new Set(stations)];

  return { stations: kept, loop: kept.length < stations.length };
}

function reindex(layout: Layout): void {
  layout.places = new Map(
    layout.segments.flatMap((segment, segmentIndex) =>
      segment.stops.map((stop, index): [string, Place] => [
        stop.didok,
        { segment: segmentIndex, index },
      ]),
    ),
  );
}

/**
 * How a pattern steps from one placed stop to the next. `block` compares two
 * stops in one block, by its order. `junction` is a step between a branch and
 * the stop it leaves from, which comes first. Any other step crosses between
 * blocks, whose listed order says nothing about the line, and counts for
 * nothing.
 */
interface Steps {
  /** Per block: steps along its order, and against it. */
  blocks: Map<number, { along: number; against: number }>;
  junction: { along: number; against: number };
}

function steps(layout: Layout, stations: readonly string[]): Steps {
  const placed = stations.filter(didok => layout.places.has(didok));
  const blocks = new Map<number, { along: number; against: number }>();
  const junction = { along: 0, against: 0 };

  for (let index = 1; index < placed.length; index += 1) {
    const from = placed[index - 1] ?? '';
    const to = placed[index] ?? '';
    const a = layout.places.get(from);
    const b = layout.places.get(to);

    if (a === undefined || b === undefined) {
      continue;
    }

    if (a.segment === b.segment) {
      const block = blocks.get(a.segment) ?? { along: 0, against: 0 };
      blocks.set(a.segment, {
        along: block.along + (a.index < b.index ? 1 : 0),
        against: block.against + (a.index < b.index ? 0 : 1),
      });
    } else if (layout.segments[b.segment]?.junction === from) {
      junction.along += 1;
    } else if (layout.segments[a.segment]?.junction === to) {
      junction.against += 1;
    }
  }

  return { blocks, junction };
}

/**
 * Steps within a block that run against the way the pattern runs the rest of
 * that block. A pattern may run a branch inward and the trunk outward — a train
 * off the branch — but a pattern that runs one block both ways disagrees with
 * the order placed.
 */
function reordered(layout: Layout, stations: readonly string[]): number {
  return [...steps(layout, stations).blocks.values()].reduce(
    (sum, block) => sum + Math.min(block.along, block.against),
    0,
  );
}

/**
 * Whichever way most of its steps within blocks run; a tie goes to its steps
 * between a branch and its junction, and a tie in both is undecided.
 */
function orientation(layout: Layout, stations: readonly string[]): Orientation | null {
  const { blocks, junction } = steps(layout, stations);
  let along = 0;
  let against = 0;

  for (const block of blocks.values()) {
    along += block.along;
    against += block.against;
  }

  if (along === against) {
    along = junction.along;
    against = junction.against;
  }

  if (along === against) {
    return null;
  }

  return along > against ? 'forward' : 'reverse';
}

/**
 * For a pattern nothing placed can turn: one that shares a single stop with the
 * line, or none, or agrees and disagrees in equal measure. With one shared stop
 * it is turned to run outward from it — ending there when that is where the
 * trunk starts, so it extends the line backwards, and starting there otherwise.
 * Anything else takes the backbone's rule, lower Didok terminal first.
 */
function fallback(layout: Layout, stations: readonly string[]): Orientation {
  const shared = stations.filter(didok => layout.places.has(didok));

  if (shared.length === 1) {
    const [junction] = shared;
    const position = stations.indexOf(junction ?? '') * 2;
    const last = stations.length - 1;
    const startsTrunk = layout.segments[0]?.stops[0]?.didok === junction;

    return (startsTrunk ? position >= last : position <= last) ? 'forward' : 'reverse';
  }

  return compare(stations[0] ?? '', stations.at(-1) ?? '') <= 0 ? 'forward' : 'reverse';
}

function stopIn(layout: Layout, segment: number, didok: string, via: Via, junction: string): SequenceStop {
  if (segment === 0) {
    return { didok, via, junction };
  }

  return { didok, via: 'branch', junction: layout.segments[segment]?.junction ?? null };
}

function branch(layout: Layout, junction: string | null, run: readonly string[]): void {
  layout.segments.push({
    junction,
    stops: run.map(didok => ({ didok, via: 'branch', junction })),
  });
}

/** New stops after `before` and nothing placed after them: an extension if it is an end, else a branch. */
function hangAfter(layout: Layout, before: string, at: Place, run: readonly string[]): void {
  const segment = layout.segments[at.segment];

  if (segment !== undefined && at.index === segment.stops.length - 1) {
    segment.stops.push(...run.map(didok => stopIn(layout, at.segment, didok, 'extension', before)));
    return;
  }

  branch(layout, before, run);
}

/**
 * New stops before `after` and nothing placed before them: an extension if that
 * is where the trunk starts, else a branch, turned to read outward from `after`.
 */
function hangBefore(layout: Layout, after: string, at: Place, run: readonly string[]): void {
  const trunk = layout.segments[0];

  if (trunk !== undefined && at.segment === 0 && at.index === 0) {
    trunk.stops.unshift(...run.map(didok => stopIn(layout, 0, didok, 'extension', after)));
    return;
  }

  branch(layout, after, [...run].reverse());
}

/**
 * Distance on a plane, in degrees of latitude: longitude shrunk by the cosine of
 * Switzerland's latitude. Only ever compared with another distance inside the
 * country, where the error is far smaller than the gap between two stations.
 */
function distance(a: Position, b: Position): number {
  return Math.hypot(a.lat - b.lat, (a.lon - b.lon) * Math.cos((46.8 * Math.PI) / 180));
}

/**
 * Where between two placed stops of one block a detour goes, as the index of the
 * stop it goes in front of. When the two are adjacent there is only one answer.
 * When the block serves stops between them that the detour skips, the patterns
 * do not say where it rejoins those stops. The Gotthard IC via Flüelen runs
 * Arth-Goldau, Flüelen, Bellinzona past a backbone of Arth-Goldau, Altdorf,
 * Biasca, Bellinzona. So it goes in the gap where it adds the least distance by
 * station coordinates. The gap just before the rejoin stop wins a tie, and wins
 * outright when a coordinate is missing.
 */
function detourGap(layout: Layout, segment: Segment, from: number, to: number, run: readonly string[]): number {
  const first = layout.positions.get(run[0] ?? '');
  const last = layout.positions.get(run.at(-1) ?? '');
  let best = to;
  let cost = Number.POSITIVE_INFINITY;

  if (first === undefined || last === undefined) {
    return best;
  }

  for (let gap = to; gap > from; gap -= 1) {
    const left = layout.positions.get(segment.stops[gap - 1]?.didok ?? '');
    const right = layout.positions.get(segment.stops[gap]?.didok ?? '');

    if (left === undefined || right === undefined) {
      return to;
    }

    const added = distance(left, first) + distance(last, right) - distance(left, right);

    if (added < cost) {
      best = gap;
      cost = added;
    }
  }

  return best;
}

function insert(
  layout: Layout,
  run: readonly string[],
  before: string | null,
  after: string | null,
): void {
  const from = before === null ? undefined : layout.places.get(before);
  const to = after === null ? undefined : layout.places.get(after);
  const segment = to === undefined ? undefined : layout.segments[to.segment];

  if (
    before !== null &&
    from !== undefined &&
    to !== undefined &&
    segment !== undefined &&
    from.segment === to.segment &&
    from.index < to.index
  ) {
    segment.stops.splice(
      detourGap(layout, segment, from.index, to.index, run),
      0,
      ...run.map(didok => stopIn(layout, to.segment, didok, 'detour', before)),
    );
    return;
  }

  if (before !== null && from !== undefined) {
    hangAfter(layout, before, from, run);
    return;
  }

  if (after !== null && to !== undefined) {
    hangBefore(layout, after, to, run);
    return;
  }

  branch(layout, null, run);
}

/** Inserts every run of not-yet-placed stops of an already turned pattern, left to right. */
function place(layout: Layout, stations: readonly string[]): void {
  let index = 0;

  while (index < stations.length) {
    if (layout.places.has(stations[index] ?? '')) {
      index += 1;
      continue;
    }

    let end = index;

    while (end + 1 < stations.length && !layout.places.has(stations[end + 1] ?? '')) {
      end += 1;
    }

    insert(
      layout,
      stations.slice(index, end + 1),
      index > 0 ? (stations[index - 1] ?? null) : null,
      end + 1 < stations.length ? (stations[end + 1] ?? null) : null,
    );
    reindex(layout);
    index = end + 1;
  }
}

/**
 * The line's one ordered list of stops, with every pattern it was built from.
 *
 * Patterns are placed busiest first. One that nothing placed yet can turn waits
 * until the rest have been placed, since a stop they add may be what it needs;
 * when none of the waiting ones can be turned, the busiest takes `fallback` and
 * the rest try again.
 */
export function canonicalSequence(
  pool: readonly PooledPattern[],
  positions: ReadonlyMap<string, Position> = new Map(),
): Sequence {
  const spine = backbone(pool);

  if (spine === null) {
    return { stops: [], patterns: [], conflicts: [], loop: false };
  }

  const visits = firstVisits(spine.stations);
  const reversed = compare(visits.stations[0] ?? '', visits.stations.at(-1) ?? '') > 0;
  const trunk = reversed ? [...visits.stations].reverse() : visits.stations;

  const layout: Layout = {
    segments: [
      { junction: null, stops: trunk.map(didok => ({ didok, via: 'backbone', junction: null })) },
    ],
    places: new Map(),
    positions,
  };
  reindex(layout);

  const turned = new Map<string, boolean>([[spine.hash, reversed]]);
  const conflicts: string[] = [];
  let loop = visits.loop;

  const apply = (pattern: PooledPattern, stations: readonly string[], way: Orientation): void => {
    const oriented = way === 'reverse' ? [...stations].reverse() : stations;

    if (reordered(layout, oriented) > 0) {
      conflicts.push(pattern.hash);
    }

    turned.set(pattern.hash, way === 'reverse');
    place(layout, oriented);
  };

  let pending = [...pool]
    .sort(compareRank)
    .filter(pattern => pattern.hash !== spine.hash)
    .map(pattern => {
      const own = firstVisits(pattern.stations);
      loop ||= own.loop;
      return { pattern, stations: own.stations };
    });

  while (pending.length > 0) {
    const waiting: typeof pending = [];

    for (const entry of pending) {
      const way = orientation(layout, entry.stations);

      if (way === null) {
        waiting.push(entry);
        continue;
      }

      apply(entry.pattern, entry.stations, way);
    }

    if (waiting.length === pending.length) {
      const [stuck, ...rest] = waiting;

      if (stuck !== undefined) {
        apply(stuck.pattern, stuck.stations, fallback(layout, stuck.stations));
      }

      pending = rest;
      continue;
    }

    pending = waiting;
  }

  return {
    stops: layout.segments.flatMap(segment => segment.stops),
    patterns: [...pool]
      .sort(compareRank)
      .map(pattern => ({ ...pattern, reversed: turned.get(pattern.hash) ?? false })),
    conflicts: conflicts.sort(compare),
    loop,
  };
}
