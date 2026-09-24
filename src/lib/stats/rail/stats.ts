import type {
  RailCategoryProgress,
  RailLine,
  RailLineProgress,
  RailLineRidership,
  RailRide,
  RailRideCoverage,
  RailRideLogEntry,
  RailStation,
  RailStop,
  RailTotals,
} from '@/lib/stats/rail/types';

/**
 * Rides turned into progress, from what `loadRail` returns. Pure, the same as
 * `@/lib/stats/flights/stats`: no query, no cache, no clock.
 *
 * `toCoverage` is the seam, as `toLegs` is for the flights. Everything after it
 * takes `RailRideCoverage[]` and can assume every ride resolved, which is why
 * it is the only function here that has to think about a line or a stop the
 * data has never heard of.
 */

/**
 * One line as something a ride can walk. The sequence is not one straight run
 * of stops: after the trunk come the branch blocks, each read outward from its
 * `junction`. So the stops are nodes, and the edges are the steps a train
 * takes between them.
 */
interface LineGraph {
  sequences: number[];
  sequenceOf: Map<string, number>;
  neighbours: Map<number, number[]>;
}

/**
 * The trunk is every stop that is not on a branch, in sequence order. Detours
 * and extensions sit inline in it, so a ride past a detour covers its stops: a
 * ride only records where it got on and off, and cannot say which way it went.
 *
 * A branch block is a run of `branch` stops that share a `junction`. Its first
 * stop hangs off the junction and the rest follow in order. A block with no
 * junction, or one that is not on the line, shares no stop with the line and
 * hangs off nothing, so only a ride within it can reach its stops.
 *
 * Trunk and blocks form a tree, which is what makes the path between two stops
 * the only one. Two blocks off one junction that happen to be listed one after
 * the other would read as one; nothing in the rows can tell them apart.
 */
function lineGraph(stops: RailStop[]): LineGraph {
  const ordered = [...stops].sort((a, b) => a.sequence - b.sequence);
  const sequenceOf = new Map<string, number>();
  const neighbours = new Map<number, number[]>();

  for (const stop of ordered) {
    neighbours.set(stop.sequence, []);

    if (stop.didok !== null && !sequenceOf.has(stop.didok)) {
      sequenceOf.set(stop.didok, stop.sequence);
    }
  }

  const link = (a: number, b: number) => {
    neighbours.get(a)?.push(b);
    neighbours.get(b)?.push(a);
  };

  let trunk: RailStop | null = null;
  let previous: RailStop | null = null;

  for (const stop of ordered) {
    if (stop.via !== 'branch') {
      if (trunk) link(trunk.sequence, stop.sequence);
      trunk = stop;
    } else if (
      previous?.via === 'branch' &&
      previous.junction === stop.junction
    ) {
      link(previous.sequence, stop.sequence);
    } else {
      const junction =
        stop.junction === null ? undefined : sequenceOf.get(stop.junction);

      if (junction !== undefined) link(junction, stop.sequence);
    }

    previous = stop;
  }

  return {
    sequences: ordered.map(({ sequence }) => sequence),
    sequenceOf,
    neighbours,
  };
}

/** The stops between two, both included, or null when nothing connects them. */
function walk(graph: LineGraph, from: number, to: number): number[] | null {
  const cameFrom = new Map<number, number>([[from, from]]);
  const queue = [from];

  for (let index = 0; index < queue.length && !cameFrom.has(to); index += 1) {
    const at = queue[index];

    for (const next of graph.neighbours.get(at) ?? []) {
      if (cameFrom.has(next)) continue;

      cameFrom.set(next, at);
      queue.push(next);
    }
  }

  if (!cameFrom.has(to)) return null;

  const path = [to];

  for (let at = to; at !== from; ) {
    at = cameFrom.get(at) ?? from;
    path.push(at);
  }

  return path.sort((a, b) => a - b);
}

const skip = (ride: RailRide, reason: string) =>
  console.warn(
    `[stats/rail] skipping ride ${ride.id} on ${ride.riddenOn}: ${reason}`,
  );

/**
 * Rides to the stops they covered.
 *
 * Nothing in Postgres checks that a ride's stops are on its line, so a ride
 * whose line or stops the data does not know is dropped with a warning rather
 * than counted as nothing, the same as `toLegs` does with an airport. So is a
 * ride between two stops no train connects, which only a block that shares no
 * stop with its line can cause.
 *
 * Input order is preserved.
 */
export function toCoverage(
  lines: RailLine[],
  stops: RailStop[],
  rides: RailRide[],
): RailRideCoverage[] {
  const lineById = new Map(lines.map((line) => [line.id, line]));
  const stopsByLine = new Map<string, RailStop[]>();

  for (const stop of stops) {
    const lineStops = stopsByLine.get(stop.lineId);

    if (lineStops) lineStops.push(stop);
    else stopsByLine.set(stop.lineId, [stop]);
  }

  const graphs = new Map<string, LineGraph>();
  const graphOf = (lineId: string): LineGraph => {
    const cached = graphs.get(lineId);

    if (cached) return cached;

    const graph = lineGraph(stopsByLine.get(lineId) ?? []);
    graphs.set(lineId, graph);

    return graph;
  };

  const coverage: RailRideCoverage[] = [];

  for (const ride of rides) {
    const line = lineById.get(ride.lineId);

    if (!line) {
      skip(ride, `${ride.lineId} is not a known line`);
      continue;
    }

    const graph = graphOf(line.id);

    if (ride.fromDidok === null && ride.toDidok === null) {
      coverage.push({ ride, line, sequences: [...graph.sequences] });
      continue;
    }

    const from =
      ride.fromDidok === null ? undefined : graph.sequenceOf.get(ride.fromDidok);
    const to =
      ride.toDidok === null ? undefined : graph.sequenceOf.get(ride.toDidok);

    if (from === undefined || to === undefined) {
      const unknown = [
        from === undefined && String(ride.fromDidok),
        to === undefined && String(ride.toDidok),
      ]
        .filter(Boolean)
        .join(', ');

      skip(ride, `${unknown} is not on ${line.id}`);
      continue;
    }

    const sequences = walk(graph, from, to);

    if (!sequences) {
      skip(
        ride,
        `nothing connects ${ride.fromDidok} and ${ride.toDidok} on ${line.id}`,
      );
      continue;
    }

    coverage.push({ ride, line, sequences });
  }

  return coverage;
}

/** Every covered sequence, per line, once however many rides covered it. */
function coveredByLine(coverage: RailRideCoverage[]): Map<string, Set<number>> {
  const covered = new Map<string, Set<number>>();

  for (const { line, sequences } of coverage) {
    const lineCovered = covered.get(line.id) ?? new Set<number>();

    for (const sequence of sequences) lineCovered.add(sequence);
    covered.set(line.id, lineCovered);
  }

  return covered;
}

/**
 * One entry per line, ridden or not, in the order the lines came in. A line
 * with no stops can be touched but never complete: nothing covered is not the
 * same as everything covered.
 */
export function lineProgress(
  lines: RailLine[],
  stops: RailStop[],
  coverage: RailRideCoverage[],
): RailLineProgress[] {
  const stopCounts = new Map<string, number>();

  for (const { lineId } of stops) {
    stopCounts.set(lineId, (stopCounts.get(lineId) ?? 0) + 1);
  }

  const covered = coveredByLine(coverage);

  return lines.map((line) => {
    const lineStops = stopCounts.get(line.id) ?? 0;
    const lineCovered = covered.get(line.id)?.size ?? 0;

    return {
      line,
      stops: lineStops,
      covered: lineCovered,
      share: lineStops === 0 ? 0 : lineCovered / lineStops,
      touched: covered.has(line.id),
      complete: lineStops > 0 && lineCovered === lineStops,
    };
  });
}

/**
 * Stations gone through, once each however many lines serve them: Zürich HB
 * on the S12 and on the IC1 is one station.
 *
 * A stop with no Didok number still counts towards its line's share, but is
 * left out here, since there is nothing to tell it apart from the same station
 * on another line. The name and position are the first stop's to list it.
 */
export function stationsVisited(
  stops: RailStop[],
  coverage: RailRideCoverage[],
): RailStation[] {
  const covered = coveredByLine(coverage);
  const stations = new Map<string, RailStation>();

  for (const { lineId, sequence, didok, stopName, lat, lon } of stops) {
    if (didok === null || stations.has(didok)) continue;
    if (!covered.get(lineId)?.has(sequence)) continue;

    stations.set(didok, { didok, stopName, lat, lon });
  }

  return [...stations.values()].sort(
    (x, y) =>
      x.stopName.localeCompare(y.stopName) || x.didok.localeCompare(y.didok),
  );
}

/**
 * `lineProgress` summed per `category`, so the categories add up to the
 * totals. Ordered by lines, then by category, so the order does not depend on
 * the order the lines came in.
 */
export function categoryProgress(
  progress: RailLineProgress[],
): RailCategoryProgress[] {
  const categories = new Map<string, RailCategoryProgress>();

  for (const { line, stops, covered, touched, complete } of progress) {
    const category = categories.get(line.category) ?? {
      category: line.category,
      lines: 0,
      touched: 0,
      complete: 0,
      stops: 0,
      covered: 0,
    };

    category.lines += 1;
    category.touched += touched ? 1 : 0;
    category.complete += complete ? 1 : 0;
    category.stops += stops;
    category.covered += covered;
    categories.set(line.category, category);
  }

  return [...categories.values()].sort(
    (x, y) => y.lines - x.lines || x.category.localeCompare(y.category),
  );
}

/**
 * Counted off `lineProgress` rather than off the rides, so the totals cannot
 * disagree with the lines they sum. `lines` is every line in the data rather
 * than a number written down here, so a December refresh that adds one moves
 * it.
 */
export function railTotals(
  progress: RailLineProgress[],
  stations: RailStation[],
): RailTotals {
  return {
    lines: progress.length,
    touched: progress.filter(({ touched }) => touched).length,
    complete: progress.filter(({ complete }) => complete).length,
    stations: stations.length,
  };
}

/**
 * The touched lines, most ridden first. Every line counts towards the goal
 * once, but the commute gets ridden every week, and this is where that shows.
 * Counted off the coverage, so a ride the totals skipped is not counted here
 * either. Ties go to the line further along, then by name.
 */
export function lineRidership(
  progress: RailLineProgress[],
  coverage: RailRideCoverage[],
): RailLineRidership[] {
  const rides = new Map<string, { rides: number; lastRiddenOn: string }>();

  for (const { ride, line } of coverage) {
    const entry = rides.get(line.id) ?? { rides: 0, lastRiddenOn: '' };

    entry.rides += 1;
    if (ride.riddenOn > entry.lastRiddenOn) entry.lastRiddenOn = ride.riddenOn;
    rides.set(line.id, entry);
  }

  return progress
    .flatMap((entry) => {
      const ridden = rides.get(entry.line.id);

      return ridden ? [{ ...entry, ...ridden }] : [];
    })
    .sort(
      (x, y) =>
        y.rides - x.rides ||
        y.share - x.share ||
        x.line.displayName.localeCompare(y.line.displayName) ||
        x.line.id.localeCompare(y.line.id),
    );
}

/**
 * Resolved rides with their stops named, in the order they came in, so newest
 * first off `loadRail`. Off the coverage rather than the rides, so a ride the
 * totals skipped is not in the log either.
 *
 * A Didok number listed twice on a line names the first stop to list it, the
 * same one `toCoverage` walks from.
 */
export function rideLog(
  coverage: RailRideCoverage[],
  stops: RailStop[],
): RailRideLogEntry[] {
  const names = new Map<string, string>();

  for (const { lineId, didok, stopName } of stops) {
    const key = `${lineId} ${didok}`;

    if (didok !== null && !names.has(key)) names.set(key, stopName);
  }

  const nameOf = (lineId: string, didok: string | null) =>
    didok === null ? null : (names.get(`${lineId} ${didok}`) ?? didok);

  return coverage.map(({ ride, line }) => ({
    ride,
    line,
    from: nameOf(line.id, ride.fromDidok),
    to: nameOf(line.id, ride.toDidok),
  }));
}
