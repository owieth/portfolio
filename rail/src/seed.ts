/**
 * Step ten: add the lines the feed does not have.
 *
 * `data/funiculars.json` holds the funiculars that are rideable and absent from
 * the feed — for 2026, the Gelmerbahn. They join the line set here, after every
 * step that reads the feed, and every line leaves this step marked with where it
 * came from: `feed` or `manual`. A hand-written line has no `route_id`s, no
 * patterns and no timetable behind it, and nothing downstream may mistake it for
 * one that does.
 *
 * The feed gains lines. A seeded stop that a feed line of the same category now
 * serves is reported, so the entry is removed at the next December refresh
 * rather than riding along as a second copy. A seeded id that a feed line
 * already has is fatal: two lines on one id is not something to report.
 *
 * Pure: it takes the named lines and the parsed seed, and opens nothing.
 */

import { createHash } from 'node:crypto';

import { compare } from './merge/key.ts';
import type { NamedLine } from './naming.ts';
import type { SeedLine, SeedStop } from './seed/funiculars.ts';

export interface FeedLine extends NamedLine {
  source: 'feed';
}

export interface ManualLine extends Omit<NamedLine, 'nameSource'> {
  source: 'manual';
  /** Written by hand, so neither read off a number nor derived. */
  nameSource: 'manual';
  /** In running order, with coordinates. A feed line's come from its patterns. */
  stops: SeedStop[];
}

export type SeededLine = FeedLine | ManualLine;

export interface Seeded {
  /** Feed and manual lines together, ordered by id. */
  lines: SeededLine[];
  /** How many of them were written by hand, for the report to count apart. */
  manual: number;
  /** Seeded ids with a stop that a feed line of the same category now serves. */
  inFeed: string[];
  /** One hash over every manual line, to compare two runs by. */
  fingerprint: string;
}

type Log = (message: string) => void;

function plural(value: number, noun: string): string {
  return `${value.toLocaleString('en-US')} ${value === 1 ? noun : `${noun}s`}`;
}

function toLine(seed: SeedLine): ManualLine {
  const first = seed.stops[0]?.didok;
  const last = seed.stops.at(-1)?.didok;
  const terminals: [string, string] | null =
    first === undefined || last === undefined
      ? null
      : compare(first, last) <= 0
        ? [first, last]
        : [last, first];

  return {
    id: seed.id,
    category: seed.category,
    number: null,
    region: seed.id.slice(0, seed.id.indexOf(':')),
    terminals,
    operators: [seed.operator],
    routeIds: [],
    stations: [...new Set(seed.stops.flatMap(stop => stop.didok ?? []))].sort(compare),
    name: seed.name,
    nameSource: 'manual',
    review: [],
    source: 'manual',
    stops: seed.stops,
  };
}

function fingerprintOf(lines: readonly ManualLine[]): string {
  const hash = createHash('sha256');

  for (const line of lines) {
    hash.update(
      [
        line.id,
        line.category,
        line.name,
        line.operators.join(','),
        line.stops.map(stop => `${stop.didok ?? ''}@${stop.lat},${stop.lon}`).join(' '),
      ].join('|'),
    );
    hash.update('\n');
  }

  return hash.digest('hex').slice(0, 16);
}

export function seedLines(
  named: readonly NamedLine[],
  seed: readonly SeedLine[],
  log: Log,
): Seeded {
  const feedIds = new Set(named.map(line => line.id));
  const clashes = seed.filter(entry => feedIds.has(entry.id)).map(entry => entry.id);

  if (clashes.length > 0) {
    throw new Error(
      `data/funiculars.json seeds ${clashes.join(', ')}, which the feed already has; remove ${clashes.length === 1 ? 'it' : 'them'} from the seed file`,
    );
  }

  const manual = seed.map(toLine).sort((a, b) => compare(a.id, b.id));

  const inFeed = manual
    .filter(line =>
      named.some(
        feed =>
          feed.category === line.category &&
          line.stations.some(didok => feed.stations.includes(didok)),
      ),
    )
    .map(line => line.id);

  const lines: SeededLine[] = [
    ...named.map((line): FeedLine => ({ ...line, source: 'feed' })),
    ...manual,
  ].sort((a, b) => compare(a.id, b.id));

  const fingerprint = fingerprintOf(manual);

  log(
    `${plural(manual.length, 'line')} seeded by hand from data/funiculars.json, fingerprint ${fingerprint}${
      manual.length > 0 ? `: ${manual.map(line => `${line.id} "${line.name}"`).join('; ')}` : ''
    }`,
  );

  for (const id of inFeed) {
    log(
      `seeded line ${id} stops where a feed line of its category now stops; if the feed has it, remove it from data/funiculars.json`,
    );
  }

  return { lines, manual: manual.length, inFeed, fingerprint };
}
