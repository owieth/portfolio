/**
 * Step fifteen: give every line its two termini, and for a line that crosses the
 * border, the two it really runs between.
 *
 * A line's termini are the ends of its trunk: the first stop of its canonical
 * sequence and the last one before the branch blocks. Those are Swiss by
 * construction, because the patterns were cut at the border, and for a train
 * that runs abroad they name where it leaves the country rather than where it
 * goes. An EC to Milano would read as ending at Chiasso, and a TGV that serves
 * one Swiss station either side of a loop could read as Genève to Genève. So
 * each line also gets its **true termini**, read from the trips' unclipped ends.
 *
 * The rule, per Swiss terminus: of the trips whose Swiss end on that side is
 * that terminus, the station they really end at most often, weighted by the
 * days they run — the same busiest-wins rule that picks a line's backbone. When
 * most of those trips end in Switzerland, or no trip ends there at all, the
 * true terminus is the Swiss one. A tie goes to the lower Didok number.
 *
 * A hand-written line from `data/funiculars.json` has no trips; its termini are
 * its first and last stop, and so are its true ones.
 *
 * Takes the feed directory for the reason `patterns.ts` gives: it reads the
 * store that the ingest and calendar steps wrote beside `gtfs.zip`.
 */

import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';

import { openGtfs } from './db.ts';
import type { Gtfs } from './db.ts';
import { gtfsPath } from './fetch/record.ts';
import { STORE_FILE } from './ingest.ts';
import type { MatchedLine } from './match.ts';
import { compare } from './merge/key.ts';
import { RAIL_DIR } from './paths.ts';
import { keyTable } from './patterns/queries.ts';
import { lineRoutes } from './seasonal/queries.ts';
import type { Station } from './stations.ts';
import {
  REQUIRED_COLUMNS,
  STORE_TABLES,
  TABLES,
  TRUE_ENDS,
  columns,
} from './termini/queries.ts';
import type {
  ColumnRow,
  TableRow,
  TerminiFile,
  TrueEndRow,
} from './termini/queries.ts';

/** How many lines the log names. */
const SHOWN = 5;

export interface Terminus {
  /** `null` only for a hand-seeded stop the service-point register does not know. */
  didok: string | null;
  name: string;
}

export type TerminiLine = MatchedLine & {
  /** The ends of the trunk, in sequence order. Swiss by construction. */
  termini: [Terminus, Terminus];
  /** Where the trains on each side really end. The same as `termini` for a domestic line. */
  trueTermini: [Terminus, Terminus];
};

export interface TerminiInput {
  lines: readonly MatchedLine[];
  /** For the Swiss termini's names, and to tell a Swiss stop from a foreign one. */
  stations: readonly Station[];
}

export interface Termini {
  /** In the match step's order, which is by id. */
  lines: TerminiLine[];
  /** Ids of the lines whose true termini are not their Swiss ones. */
  international: string[];
  /** One hash over every line's termini, to compare two runs by. */
  fingerprint: string;
}

type Log = (message: string) => void;

type FeedLine = Extract<MatchedLine, { source: 'feed' }>;

function count(value: number): string {
  return value.toLocaleString('en-US');
}

function plural(value: number, noun: string): string {
  return `${count(value)} ${value === 1 ? noun : `${noun}s`}`;
}

function here(path: string): string {
  return relative(RAIL_DIR, path);
}

function same(a: Terminus, b: Terminus): boolean {
  return a.didok === b.didok && a.name === b.name;
}

async function assertColumns(db: Gtfs): Promise<void> {
  const files = Object.keys(REQUIRED_COLUMNS) as TerminiFile[];

  const missing = await Promise.all(
    files.map(async file => {
      const present = new Set(
        (await db.query<ColumnRow>(columns(file))).map(row => row.column_name),
      );
      const absent = REQUIRED_COLUMNS[file].filter(
        column => !present.has(column),
      );
      return absent.length === 0
        ? null
        : `${file}.txt is missing ${absent.join(', ')}`;
    }),
  );

  const sentences = missing.filter(sentence => sentence !== null);

  if (sentences.length > 0) {
    throw new Error(
      `${sentences.join('; ')}; rerun pnpm recon:data to see what the feed does carry`,
    );
  }
}

async function assertStore(db: Gtfs, store: string): Promise<void> {
  const present = new Set(
    (await db.query<TableRow>(TABLES)).map(row => row.table_name),
  );
  const missing = STORE_TABLES.filter(table => !present.has(table));

  if (missing.length > 0) {
    throw new Error(
      `${here(store)} has no ${missing.join(' or ')} table; the ingest and calendar steps write them and have to run first`,
    );
  }
}

async function readTrueEnds(
  feedDir: string,
  lines: readonly FeedLine[],
  didoks: readonly string[],
): Promise<TrueEndRow[]> {
  const store = join(feedDir, STORE_FILE);
  const db = await openGtfs(gtfsPath(feedDir), ['trips', 'stops'], { store });

  try {
    await Promise.all([assertColumns(db), assertStore(db, store)]);

    await db.run(
      lineRoutes(
        lines.flatMap(line =>
          line.routeIds.map(routeId => ({ lineId: line.id, routeId })),
        ),
      ),
    );
    await db.run(keyTable('swiss', 'didok', didoks));

    return await db.query<TrueEndRow>(TRUE_ENDS);
  } finally {
    db.close();
  }
}

/**
 * The first stop of the sequence and the last one of its trunk. Branch blocks
 * come after the trunk and are read outward from their junction, so their last
 * stop is the end of a branch, not of the line.
 */
export function trunkEnds(line: FeedLine): [string, string] {
  const trunk = line.sequence.filter(stop => stop.via !== 'branch');
  const first = trunk[0]?.didok;
  const last = trunk.at(-1)?.didok;

  if (first === undefined || last === undefined) {
    throw new Error(
      `line ${line.id} has no trunk in its sequence; the sequence step should have stopped the build`,
    );
  }

  return [first, last];
}

/**
 * The busiest true end among the rows for one Swiss end: the most runs, then the
 * most trips, then the lower Didok number. `null` when no trip ends there.
 */
export function busiestEnd(rows: readonly TrueEndRow[]): TrueEndRow | null {
  let best: TrueEndRow | null = null;

  for (const row of rows) {
    if (
      best === null ||
      row.runs > best.runs ||
      (row.runs === best.runs && row.trips > best.trips) ||
      (row.runs === best.runs &&
        row.trips === best.trips &&
        compare(row.true_didok, best.true_didok) < 0)
    ) {
      best = row;
    }
  }

  return best;
}

function fingerprintOf(lines: readonly TerminiLine[]): string {
  const hash = createHash('sha256');

  for (const line of lines) {
    hash.update(
      [line.id, ...line.termini, ...line.trueTermini]
        .map(end =>
          typeof end === 'string' ? end : `${end.didok ?? ''}:${end.name}`,
        )
        .join('|'),
    );
    hash.update('\n');
  }

  return hash.digest('hex').slice(0, 16);
}

function describe(line: TerminiLine): string {
  const [a, b] = line.termini;
  const [trueA, trueB] = line.trueTermini;

  return `${line.id} (${a.name}–${b.name} runs ${trueA.name}–${trueB.name})`;
}

export async function findTermini(
  feedDir: string,
  input: TerminiInput,
  log: Log,
): Promise<Termini> {
  const { lines, stations } = input;
  const byDidok = new Map(stations.map(station => [station.didok, station]));
  const feed = lines.filter((line): line is FeedLine => line.source === 'feed');

  const endsBySide = new Map<string, TrueEndRow[]>();

  for (const row of await readTrueEnds(feedDir, feed, [...byDidok.keys()])) {
    const key = `${row.line_id} ${row.swiss_end}`;
    endsBySide.set(key, [...(endsBySide.get(key) ?? []), row]);
  }

  function swissTerminus(line: FeedLine, didok: string): Terminus {
    const station = byDidok.get(didok);

    // Every station of a sequence came out of a pattern, and a pattern is made
    // of stations the stations step kept, so a miss is a sign two steps read
    // different feeds.
    if (station === undefined) {
      throw new Error(
        `line ${line.id} ends at ${didok}, which the stations step does not have; the steps no longer describe the same feed`,
      );
    }

    return { didok, name: station.name };
  }

  function trueTerminus(line: FeedLine, swiss: Terminus): Terminus {
    const best = busiestEnd(endsBySide.get(`${line.id} ${swiss.didok}`) ?? []);

    return best === null || best.true_didok === swiss.didok
      ? swiss
      : { didok: best.true_didok, name: best.true_name };
  }

  const found = lines.map((line): TerminiLine => {
    if (line.source === 'manual') {
      const first = line.stops[0];
      const last = line.stops.at(-1);

      if (first === undefined || last === undefined) {
        throw new Error(
          `seeded line ${line.id} has no stops; the seed file should have been rejected`,
        );
      }

      const termini: [Terminus, Terminus] = [
        { didok: first.didok ?? null, name: first.name },
        { didok: last.didok ?? null, name: last.name },
      ];

      return { ...line, termini, trueTermini: termini };
    }

    const [a, b] = trunkEnds(line).map(didok => swissTerminus(line, didok)) as [
      Terminus,
      Terminus,
    ];

    return {
      ...line,
      termini: [a, b],
      trueTermini: [trueTerminus(line, a), trueTerminus(line, b)],
    };
  });

  const crossing = found.filter(
    line =>
      !same(line.termini[0], line.trueTermini[0]) ||
      !same(line.termini[1], line.trueTermini[1]),
  );
  const international = crossing.map(line => line.id);
  const fingerprint = fingerprintOf(
    [...found].sort((a, b) => compare(a.id, b.id)),
  );

  log(
    `${plural(international.length, 'line')} of ${count(found.length)} run past the border, and carry their true termini beside the Swiss ones — fingerprint ${fingerprint}`,
  );

  if (international.length > 0) {
    log(
      `international lines: ${crossing.slice(0, SHOWN).map(describe).join(', ')}${international.length > SHOWN ? ', …' : ''}`,
    );
  }

  return { lines: found, international, fingerprint };
}
