/**
 * `pnpm rides:data`: write `supabase/seeds/rail_rides.sql` from a calendar
 * export.
 *
 * A one-off, not a build step. The export is an `.ics` of my own calendar,
 * dropped in `data/raw/` and gitignored with the rest of the cache; the rides it
 * produces are committed. Rerun it only when a newer export should replace the
 * seed, and read the diff before committing, because the rows are the ride log
 * the stats page counts.
 *
 * It never talks to a database. `supabase db reset` runs the file it writes
 * locally, and `supabase db push --include-seed` runs it against the project,
 * by hand, like every other migration here.
 *
 * Days after the export's own date are dropped. The calendar holds months of
 * scheduled office days that have not happened yet, and a ride is something I
 * have taken.
 */

import { readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseCsv } from './diff/csv.ts';
import { LINE_STOPS_CSV } from './emit.ts';
import { RAIL_DIR, RAW_DIR } from './paths.ts';
import { classify } from './rides/commute.ts';
import { parseIcs } from './rides/ics.ts';
import { planRides } from './rides/plan.ts';
import type { OfficeDay, Ride } from './rides/plan.ts';
import { renderRides } from './rides/sql.ts';

/** Where `supabase/config.toml`'s `[db.seed]` looks for it. */
export const RIDES_SQL = fileURLToPath(
  new URL('../../supabase/seeds/rail_rides.sql', import.meta.url),
);

/** The export, gitignored. Copy it out of Calendar.app; see the README. */
export const CALENDAR_ICS = join(RAW_DIR, 'calendar.ics');

/** Events with this summary are office days. Everything else in the export is ignored. */
export const OFFICE_SUMMARY = 'Frigg';

export interface RidesPaths {
  ics?: string;
  dir?: string;
  out?: string;
  /** Last day to keep. Defaults to the day the export file was written. */
  through?: string;
}

export interface Rides {
  days: number;
  rides: Ride[];
  byLine: Map<string, number>;
  sql: string;
}

type Log = (message: string) => void;

function isoDate(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/**
 * Every ride's two stops have to be stops of its line, or the coverage layer
 * skips the ride with a warning and the totals silently shrink. Checked here
 * against the committed `line_stops.csv` rather than left to the database,
 * which cannot express it: `rail_line_stops` is keyed by sequence, so a foreign
 * key would point at a stop that a December refresh can renumber.
 */
function assertOnLine(rides: Ride[], stops: Map<string, Set<string>>): void {
  for (const ride of rides) {
    const line = stops.get(ride.lineId);

    if (!line) {
      throw new Error(`${ride.lineId} is not a line in ${LINE_STOPS_CSV}`);
    }

    for (const didok of [ride.fromDidok, ride.toDidok]) {
      if (!line.has(didok)) {
        throw new Error(
          `${ride.lineId} does not stop at ${didok} (ridden ${ride.riddenOn})`,
        );
      }
    }
  }
}

async function lineStops(dir: string): Promise<Map<string, Set<string>>> {
  const stops = new Map<string, Set<string>>();

  for (const row of parseCsv(await readFile(join(dir, LINE_STOPS_CSV), 'utf8'))) {
    const { line_id: lineId, didok } = row;

    // Every cell of a CSV can be empty. A stop with no Didok cannot be an end of
    // a ride, so leaving it out of the index is what makes `assertOnLine` reject
    // one, rather than a second check for the same thing.
    if (lineId === null || didok === null) continue;

    const line = stops.get(lineId) ?? new Set<string>();

    line.add(didok);
    stops.set(lineId, line);
  }

  return stops;
}

export async function renderRidesFrom({
  ics = CALENDAR_ICS,
  dir = RAIL_DIR,
  through,
}: RidesPaths = {}): Promise<Rides> {
  const text = await readFile(ics, 'utf8');
  const digest = createHash('sha256').update(text).digest('hex');
  const last = through ?? isoDate((await stat(ics)).mtime);
  const { events } = parseIcs(text);
  const days: OfficeDay[] = [];

  for (const event of events) {
    if (event.summary !== OFFICE_SUMMARY || event.date > last) continue;

    if (event.recurs) {
      throw new Error(
        `the ${event.date} office event recurs; expanding a recurrence is not implemented`,
      );
    }

    const destination = classify(event.location);

    if (!destination) {
      const place = JSON.stringify(event.location.split('\n')[0]);

      throw new Error(`no destination for the ${event.date} office event at ${place}`);
    }

    days.push({ date: event.date, destination });
  }

  const { rides, byLine } = planRides(days);

  assertOnLine(rides, await lineStops(dir));

  return {
    days: days.length,
    rides,
    byLine,
    sql: renderRides(rides, { digest, through: last, days: days.length, byLine }),
  };
}

export async function writeRides(log: Log, paths: RidesPaths = {}): Promise<Rides> {
  const rides = await renderRidesFrom(paths);

  await writeFile(paths.out ?? RIDES_SQL, rides.sql, 'utf8');

  const count = rides.rides.length.toLocaleString('en-US');
  const days = rides.days.toLocaleString('en-US');

  log(`wrote ${count} rides over ${rides.byLine.size} lines from ${days} office days`);

  return rides;
}
