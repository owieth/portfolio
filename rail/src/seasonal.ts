/**
 * Step twelve: flag the lines that only run part of the year, and count each
 * line's trips in the reference week.
 *
 * Some mountain railways and funiculars only run in summer. They are still lines
 * to ride, so they stay in the output, marked `seasonal`: running in fewer than
 * `SEASONAL_SHARE` of the feed year's weeks, counted over every route merged
 * into the line. The Pilatus rack railway runs from May to November and is one.
 *
 * `tripsPerWeek` is the line's trips in the reference week that `calendar.ts`
 * names, so every line is counted over the same seven days. A funicular that
 * runs every ten minutes is often one template trip in `frequencies.txt` rather
 * than seventy trips in `trips.txt`, and is counted by its departures, or it
 * would come out with a trip a day.
 *
 * A hand-written line from `data/funiculars.json` has no timetable behind it, so
 * every number is `null` on it rather than a zero that would read as "does
 * not run".
 *
 * Takes the feed directory for the reason `patterns.ts` gives: it reads the
 * store that the calendar step wrote beside `gtfs.zip`.
 */

import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';

import type { DateRange } from './calendar/week.ts';
import { openGtfs } from './db.ts';
import type { Gtfs } from './db.ts';
import { gtfsPath } from './fetch/record.ts';
import { STORE_FILE } from './ingest.ts';
import { compare } from './merge/key.ts';
import { RAIL_DIR } from './paths.ts';
import type { ManualLine } from './seed.ts';
import {
  FREQUENCY_WINDOWS,
  INVALID_FREQUENCIES,
  REQUIRED_COLUMNS,
  STORE_TABLES,
  TABLES,
  columns,
  lineRoutes,
  lineService,
} from './seasonal/queries.ts';
import type {
  ColumnRow,
  InvalidRow,
  LineServiceRow,
  SeasonalFile,
  TableRow,
} from './seasonal/queries.ts';
import type { SequencedFeedLine, SequencedLine } from './sequence.ts';

/**
 * A line running in fewer than this share of the feed year's weeks is seasonal.
 *
 * Weeks rather than days, because a line that only runs at weekends is not
 * seasonal: the night S-Bahn runs on 113 days of the 2026 feed year, fewer than
 * a summer mountain railway, and in every one of its weeks. A week counts when
 * the line runs on at least one day of it.
 *
 * Two thirds, because the summer lines sit under it — the Pilatus and the
 * Niesenbahn run in 30 of the 2026 feed's 52 weeks, the Stanserhorn, from April
 * to November, in 34 — and a line that closes for a few weeks' revision a year,
 * like the Sunnegga in 40, is well over it.
 */
export const SEASONAL_SHARE = 2 / 3;

/** How many line ids the log names per list. */
const SHOWN = 5;

const DAY_MS = 86_400_000;

export interface SeasonalFeedLine extends SequencedFeedLine {
  /** Distinct days of the feed year on which any of its routes runs. */
  serviceDays: number;
  /** Seven-day blocks of the feed year, from its first day, with at least one of them. */
  serviceWeeks: number;
  /** Runs in fewer than `SEASONAL_SHARE` of the feed year's weeks. */
  seasonal: boolean;
  /** Departures in the reference week, frequency-based trips expanded. */
  tripsPerWeek: number;
}

/** A hand-written line, with no timetable to count. */
export interface SeasonalManualLine extends ManualLine {
  serviceDays: null;
  serviceWeeks: null;
  seasonal: null;
  tripsPerWeek: null;
}

export type SeasonalLine = SeasonalFeedLine | SeasonalManualLine;

export interface SeasonalInput {
  lines: readonly SequencedLine[];
  /** The feed year, from the calendar step. */
  window: DateRange;
  /** The week trips are counted over, from the calendar step. */
  referenceWeek: DateRange;
}

export interface Seasonal {
  /** In the sequence step's order, which is by id. */
  lines: SeasonalLine[];
  /** Ids of the seasonal feed lines. */
  seasonal: string[];
  /** Ids of feed lines with no trip in the reference week. */
  idle: string[];
  /** Template trips in `frequencies.txt` on a line, counted by their departures. */
  frequencyTrips: number;
  /** One hash over every feed line's numbers, to compare two runs by. */
  fingerprint: string;
  elapsedMs: number;
}

type Log = (message: string) => void;

function count(value: number): string {
  return value.toLocaleString('en-US');
}

function plural(value: number, noun: string): string {
  return `${count(value)} ${value === 1 ? noun : `${noun}s`}`;
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function sample(ids: readonly string[]): string {
  return `${ids.slice(0, SHOWN).join(', ')}${ids.length > SHOWN ? ', …' : ''}`;
}

function here(path: string): string {
  return relative(RAIL_DIR, path);
}

/** Both ends included: the 2026 feed year, 14 December to 12 December, is 364 days. */
export function daysIn(range: DateRange): number {
  return (Date.parse(range.last) - Date.parse(range.first)) / DAY_MS + 1;
}

/** Seven-day blocks from the first day, the last one possibly short: 52 for 2026. */
export function weeksIn(range: DateRange): number {
  return Math.ceil(daysIn(range) / 7);
}

async function assertColumns(db: Gtfs): Promise<void> {
  const files = Object.keys(REQUIRED_COLUMNS) as SeasonalFile[];

  const missing = await Promise.all(
    files.map(async file => {
      const present = new Set(
        (await db.query<ColumnRow>(columns(file))).map(row => row.column_name),
      );
      const absent = REQUIRED_COLUMNS[file].filter(column => !present.has(column));
      return absent.length === 0 ? null : `${file}.txt is missing ${absent.join(', ')}`;
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
  const present = new Set((await db.query<TableRow>(TABLES)).map(row => row.table_name));
  const missing = STORE_TABLES.filter(table => !present.has(table));

  if (missing.length > 0) {
    throw new Error(
      `${here(store)} has no ${missing.join(' or ')} table; the calendar step writes it and has to run first`,
    );
  }
}

function fingerprintOf(lines: readonly SeasonalFeedLine[]): string {
  const hash = createHash('sha256');

  for (const line of lines) {
    hash.update(
      [line.id, line.serviceDays, line.serviceWeeks, line.seasonal ? 's' : 'y', line.tripsPerWeek].join('|'),
    );
    hash.update('\n');
  }

  return hash.digest('hex').slice(0, 16);
}

async function readLineService(
  feedDir: string,
  lines: readonly SequencedFeedLine[],
  window: DateRange,
  week: DateRange,
): Promise<LineServiceRow[]> {
  const store = join(feedDir, STORE_FILE);
  const db = await openGtfs(gtfsPath(feedDir), ['trips', 'frequencies'], { store });

  try {
    await Promise.all([assertColumns(db), assertStore(db, store)]);

    await db.run(
      lineRoutes(lines.flatMap(line => line.routeIds.map(routeId => ({ lineId: line.id, routeId })))),
    );
    await db.run(FREQUENCY_WINDOWS);

    const [invalid] = await db.query<InvalidRow>(INVALID_FREQUENCIES);

    // A window that cannot be counted is either a broken extract or a feed that
    // says something this step does not understand, and counting it as one trip
    // would put a plausible wrong number on a funicular that nobody would doubt.
    if ((invalid?.rows ?? 0) > 0) {
      throw new Error(
        `frequencies.txt has ${plural(invalid?.rows ?? 0, 'row')} with a time that does not parse, a headway that is not positive or an end_time that is not after start_time; nothing can be counted from ${invalid?.rows === 1 ? 'it' : 'them'}`,
      );
    }

    return await db.query<LineServiceRow>(lineService(window, week));
  } finally {
    db.close();
  }
}

export async function flagSeasonal(
  feedDir: string,
  input: SeasonalInput,
  log: Log,
): Promise<Seasonal> {
  const { lines, window, referenceWeek } = input;
  const feed = lines.filter((line): line is SequencedFeedLine => line.source === 'feed');
  const weeks = weeksIn(window);
  const threshold = weeks * SEASONAL_SHARE;

  const startedAt = performance.now();
  const rows = new Map(
    (await readLineService(feedDir, feed, window, referenceWeek)).map(row => [row.line_id, row]),
  );
  const elapsedMs = performance.now() - startedAt;

  const flagged = lines.map((line): SeasonalLine => {
    if (line.source === 'manual') {
      return { ...line, serviceDays: null, serviceWeeks: null, seasonal: null, tripsPerWeek: null };
    }

    const row = rows.get(line.id);

    // Every feed line reached this step through a pattern, and a pattern is
    // made of trips, so a line with no row is a line whose routes are not in
    // trips.txt — the steps no longer describe the same feed.
    if (row === undefined) {
      throw new Error(
        `line ${line.id} has no trip in trips.txt under any of its routes; the merge and this step no longer describe the same feed`,
      );
    }

    return {
      ...line,
      serviceDays: row.service_days,
      serviceWeeks: row.service_weeks,
      seasonal: row.service_weeks < threshold,
      tripsPerWeek: row.trips_per_week,
    };
  });

  const counted = flagged.filter((line): line is SeasonalFeedLine => line.source === 'feed');
  const seasonal = counted.filter(line => line.seasonal).map(line => line.id);
  const idle = counted.filter(line => line.tripsPerWeek === 0).map(line => line.id);
  const expanded = [...rows.values()].filter(row => row.frequency_trips > 0);
  const frequencyTrips = expanded.reduce((sum, row) => sum + row.frequency_trips, 0);
  const fingerprint = fingerprintOf([...counted].sort((a, b) => compare(a.id, b.id)));

  log(
    `${plural(seasonal.length, 'line')} of ${count(counted.length)} run in fewer than two thirds of the feed year's ${count(weeks)} weeks and are flagged seasonal — ${seconds(elapsedMs)}, fingerprint ${fingerprint}`,
  );

  if (seasonal.length > 0) {
    log(`seasonal lines: ${sample(seasonal)}`);
  }

  if (frequencyTrips > 0) {
    log(
      `${plural(frequencyTrips, 'trip')} on ${plural(expanded.length, 'line')} run from frequencies.txt and are counted by their departures`,
    );
  }

  // Not fatal: a summer line that closes before September, or a replacement
  // service that ended in spring, runs no trip in the reference week. Listed,
  // because a zero is also what a misread calendar looks like.
  if (idle.length > 0) {
    log(
      `${plural(idle.length, 'line')} run no trip in the reference week, ${referenceWeek.first} to ${referenceWeek.last}: ${sample(idle)}`,
    );
  }

  return { lines: flagged, seasonal, idle, frequencyTrips, fingerprint, elapsedMs };
}
