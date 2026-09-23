/**
 * Step eleven: put every line's stops in one order.
 *
 * The map draws a line through its stops and the checklist lists them, and both
 * need one ordered list where the feed has a handful of patterns per route: two
 * directions, short-turns, branches, trains that skip stops at some hours. This
 * step builds that list — the **canonical sequence** — from every pattern of
 * every route merged into the line, by the rules in `sequence/order.ts`, and
 * keeps each of those patterns next to it, marked with which way it runs, so
 * "which segments have I ridden" stays answerable.
 *
 * Every stop records how it got its place — backbone, extension, detour or
 * branch — and the stop it was placed against, so a branch's stops are never
 * lost and their position is never a mystery.
 *
 * A hand-written line from `data/funiculars.json` has no patterns; its stops are
 * already in running order, and it passes through untouched.
 *
 * Pure: it takes the seeded lines, the patterns and the stations, and opens
 * nothing.
 */

import { createHash } from 'node:crypto';

import { compare } from './merge/key.ts';
import type { Pattern } from './patterns.ts';
import type { FeedLine, ManualLine, SeededLine } from './seed.ts';
import { canonicalSequence, poolPatterns } from './sequence/order.ts';
import type { LinePattern, Position, SequenceStop } from './sequence/order.ts';
import type { Station } from './stations.ts';

/** How many line ids the log names per list. */
const SHOWN = 5;

export interface SequencedFeedLine extends FeedLine {
  /** Every station of the line once: the trunk in running order, then its branch blocks. */
  sequence: SequenceStop[];
  /** Every distinct pattern of its routes, pooled by hash, busiest first. */
  patterns: LinePattern[];
}

export type SequencedLine = SequencedFeedLine | ManualLine;

/** A line with patterns that run its stops in an order the sequence does not. */
export interface Conflict {
  id: string;
  hashes: string[];
}

export interface Sequenced {
  /** In the seed step's order, which is by id. */
  lines: SequencedLine[];
  /** Feed lines with at least one branch block. */
  branched: string[];
  /** Feed lines with at least one detour. */
  detoured: string[];
  conflicts: Conflict[];
  /** Feed lines with a pattern that visits one station twice. */
  loops: string[];
  /** One hash over every feed line's sequence and patterns, to compare two runs by. */
  fingerprint: string;
}

export interface SequenceInput {
  lines: readonly SeededLine[];
  patterns: readonly Pattern[];
  /** For their coordinates, which place a detour the patterns leave ambiguous. */
  stations: readonly Station[];
}

type Log = (message: string) => void;

function count(value: number): string {
  return value.toLocaleString('en-US');
}

function plural(value: number, noun: string): string {
  return `${count(value)} ${value === 1 ? noun : `${noun}s`}`;
}

function sample(ids: readonly string[]): string {
  return `${ids.slice(0, SHOWN).join(', ')}${ids.length > SHOWN ? ', …' : ''}`;
}

function patternsByRoute(patterns: readonly Pattern[]): Map<string, Pattern[]> {
  const byRoute = new Map<string, Pattern[]>();

  for (const pattern of patterns) {
    byRoute.set(pattern.routeId, [...(byRoute.get(pattern.routeId) ?? []), pattern]);
  }

  return byRoute;
}

/**
 * The sequence is built from the same patterns the merge step read the line's
 * stations off, so the two have to hold the same stations. One that does not is
 * a bug in the rules, and a stop silently lost from a line is exactly what this
 * step exists to prevent.
 */
function assertComplete(line: FeedLine, sequence: readonly SequenceStop[]): void {
  const placed = sequence.map(stop => stop.didok);
  const unique = new Set(placed);
  const missing = line.stations.filter(didok => !unique.has(didok));
  const extra = [...unique].filter(didok => !line.stations.includes(didok));

  if (missing.length > 0 || extra.length > 0 || unique.size !== placed.length) {
    throw new Error(
      `line ${line.id} came out with a sequence that does not hold its stations once each — missing ${missing.join(', ') || 'none'}, extra ${extra.join(', ') || 'none'}; this is a bug in sequence/order.ts`,
    );
  }
}

/**
 * Every stop of every sequence and every pattern with its direction, in id
 * order, so two runs over the same feed can be compared by reading one line of
 * each log — the same arrangement as the merge and naming fingerprints.
 */
function fingerprintOf(lines: readonly SequencedFeedLine[]): string {
  const hash = createHash('sha256');

  for (const line of lines) {
    hash.update(
      [
        line.id,
        line.sequence.map(stop => `${stop.didok}:${stop.via}:${stop.junction ?? ''}`).join(' '),
        line.patterns
          .map(
            pattern =>
              `${pattern.hash}:${pattern.reversed ? 'r' : 'f'}:${pattern.trips}:${pattern.runs}`,
          )
          .join(' '),
      ].join('|'),
    );
    hash.update('\n');
  }

  return hash.digest('hex').slice(0, 16);
}

function positionsOf(stations: readonly Station[]): Map<string, Position> {
  return new Map(
    stations.flatMap(({ didok, lat, lon }): [string, Position][] =>
      lat === null || lon === null ? [] : [[didok, { lat, lon }]],
    ),
  );
}

export function sequenceLines(input: SequenceInput, log: Log): Sequenced {
  const { lines, patterns, stations } = input;
  const byRoute = patternsByRoute(patterns);
  const positions = positionsOf(stations);
  const branched: string[] = [];
  const detoured: string[] = [];
  const conflicts: Conflict[] = [];
  const loops: string[] = [];
  const feed: SequencedFeedLine[] = [];

  const sequenced = lines.map((line): SequencedLine => {
    if (line.source === 'manual') {
      return line;
    }

    const pool = poolPatterns(line.routeIds.flatMap(routeId => byRoute.get(routeId) ?? []));

    if (pool.length === 0) {
      throw new Error(
        `line ${line.id} reached the sequence step without a pattern; the merge and patterns steps no longer describe the same feed`,
      );
    }

    const sequence = canonicalSequence(pool, positions);
    assertComplete(line, sequence.stops);

    if (sequence.stops.some(stop => stop.via === 'branch')) {
      branched.push(line.id);
    }

    if (sequence.stops.some(stop => stop.via === 'detour')) {
      detoured.push(line.id);
    }

    if (sequence.conflicts.length > 0) {
      conflicts.push({ id: line.id, hashes: sequence.conflicts });
    }

    if (sequence.loop) {
      loops.push(line.id);
    }

    const done: SequencedFeedLine = { ...line, sequence: sequence.stops, patterns: sequence.patterns };
    feed.push(done);
    return done;
  });

  const fingerprint = fingerprintOf([...feed].sort((a, b) => compare(a.id, b.id)));

  log(
    `${plural(feed.length, 'feed line')} put in order, ${count(branched.length)} with a branch and ${count(detoured.length)} with a detour, fingerprint ${fingerprint}`,
  );

  if (branched.length > 0) {
    log(`lines with branches listed after their trunk: ${sample(branched)}`);
  }

  // Not fatal: the busier order wins, and the rest is listed, because whether a
  // disagreement is a diversion or two lines on one key takes a person to tell.
  for (const conflict of conflicts) {
    log(
      `line ${conflict.id} has ${plural(conflict.hashes.length, 'pattern')} running its stops in another order — ${conflict.hashes.join(', ')}; the busier order was kept`,
    );
  }

  if (loops.length > 0) {
    log(
      `${plural(loops.length, 'line')} with a pattern that comes back to a station, which keeps its first visit: ${sample(loops)}`,
    );
  }

  return { lines: sequenced, branched, detoured, conflicts, loops, fingerprint };
}
