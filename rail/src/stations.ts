/**
 * Step three: turn the feed's platforms into stations, and keep the Swiss ones.
 *
 * `stops.txt` is track-level. Zürich HB is 27 rows — a stop place, twenty-six
 * platforms — and the feed reaches Karlsruhe, Barcelona and Praha because trains
 * that start in Switzerland end up there. Every later step wants the opposite of
 * both: one row per station, and only the stations you can reach on a Swiss line
 * you would count as ridden.
 *
 * The collapse is the feed's own `parent_station` graph rather than anything
 * clever about names or coordinates. The country test is the Didok number's UIC
 * prefix, cross-checked against the bounding box — see `stations/switzerland.ts`
 * for why the box reports rather than votes.
 *
 * Both identifiers come out with the station, because the README promises them:
 * the Didok/UIC number and the SLOID are the join to transport.opendata.ch, and
 * a station that arrives here as a name is a station a future check-in feature
 * cannot find.
 */

import { openGtfs } from './db.ts';
import { classify, SWISS_COUNTRY } from './stations/switzerland.ts';
import { COLUMNS, REQUIRED_COLUMNS, STATIONS } from './stations/queries.ts';
import type { ColumnRow, StationRow } from './stations/queries.ts';

export interface Station {
  /**
   * The Didok number, which is also the UIC number — seven digits, the first two
   * the country. There is no separate `uic` field because for a station that got
   * this far the two are the same string, and carrying it twice would invite
   * them to disagree.
   */
  didok: string;
  /** `null` for a station the feed has not given a Swiss Location ID. */
  sloid: string | null;
  name: string;
  /** `null` only if the feed gave no usable coordinate, which it then reports. */
  lat: number | null;
  lon: number | null;
  /** Rows in `stops.txt` that collapsed into this station. */
  stops: number;
}

export interface Tally {
  /** UIC country code, or `(none)` when the Didok number was not seven digits. */
  country: string;
  stations: number;
}

/** A station the country code and the bounding box do not agree about. */
export interface Misplaced {
  didok: string;
  name: string;
  lat: number | null;
  lon: number | null;
  reason: string;
}

export interface Stations {
  /** Swiss only, ordered by Didok number. */
  stations: Station[];
  /** Dropped, counted per country code, busiest first. */
  foreign: Tally[];
  /** Swiss by country code and not where the box says Switzerland is. */
  misplaced: Misplaced[];
  /** Foreign stations the box contains anyway. Expected, and worth watching. */
  foreignInBbox: number;
  /** Rows read from `stops.txt`, station and platform alike. */
  feedStops: number;
}

type Log = (message: string) => void;

function count(value: number): string {
  return value.toLocaleString('en-US');
}

/**
 * Sorted by station count and then by code, never by insertion order: the log is
 * read against the previous run's log, and rows swapping places would be noise.
 */
function tallies(counts: Map<string, number>): Tally[] {
  return [...counts.entries()]
    .map(([country, stations]) => ({ country, stations }))
    .sort((a, b) => b.stations - a.stations || a.country.localeCompare(b.country));
}

/**
 * `original_stop_id` and `didok` are Swiss-profile extensions rather than core
 * GTFS, and the geOps mirror re-derives the feed with its own ids. Checking by
 * name up front turns "the mirror does not carry the Didok number" into that
 * sentence, instead of into a DuckDB binder error from inside a query.
 */
async function assertColumns(
  query: (sql: string) => Promise<ColumnRow[]>,
): Promise<void> {
  const present = new Set((await query(COLUMNS)).map(row => row.column_name));
  const missing = REQUIRED_COLUMNS.filter(column => !present.has(column));

  if (missing.length > 0) {
    throw new Error(
      `stops.txt is missing ${missing.join(', ')}; those are opentransportdata's own columns, so a feed without them is probably the geOps mirror — rerun pnpm recon:data to see what it does carry`,
    );
  }
}

/**
 * Takes the extracted feed directory rather than the `FetchedFeed` around it,
 * because `stops.txt` is all it reads and a test can then hand it a directory it
 * wrote itself instead of a stub of a download.
 */
export async function resolveStations(gtfsDir: string, log: Log): Promise<Stations> {
  const db = await openGtfs(gtfsDir, ['stops']);

  try {
    await assertColumns(sql => db.query<ColumnRow>(sql));

    const rows = await db.query<StationRow>(STATIONS);

    const stations: Station[] = [];
    const foreign = new Map<string, number>();
    const misplaced: Misplaced[] = [];
    let foreignInBbox = 0;
    let feedStops = 0;

    for (const row of rows) {
      feedStops += 1 + row.stops;

      const verdict = classify(row.didok, row.lat, row.lon);

      if (!verdict.swiss) {
        const country = verdict.country ?? '(none)';
        foreign.set(country, (foreign.get(country) ?? 0) + 1);

        if (verdict.inBbox === true) {
          foreignInBbox += 1;
        }

        continue;
      }

      if (verdict.inBbox !== true) {
        misplaced.push({
          didok: row.didok,
          name: row.name,
          lat: row.lat,
          lon: row.lon,
          reason:
            verdict.inBbox === null
              ? 'no usable coordinate to cross-check the country code against'
              : `country code ${SWISS_COUNTRY} but outside the Switzerland bounding box`,
        });
      }

      stations.push({
        didok: row.didok,
        sloid: row.sloid,
        name: row.name,
        lat: row.lat,
        lon: row.lon,
        stops: row.stops,
      });
    }

    if (stations.length === 0) {
      throw new Error(
        `no Swiss stations survived out of ${count(rows.length)}; every Didok number in the feed would have to have lost its ${SWISS_COUNTRY} prefix for that, so read stops.txt before trusting it`,
      );
    }

    log(
      `${count(stations.length)} of ${count(rows.length)} stations are Swiss, collapsed from ${count(feedStops)} stops in the feed`,
    );

    const excluded = tallies(foreign);

    if (excluded.length > 0) {
      log(
        `excluded ${count(rows.length - stations.length)} foreign stations — ${excluded
          .map(tally => `${tally.country} ${count(tally.stations)}`)
          .join(', ')}`,
      );
    }

    // A rectangle drawn around Switzerland contains parts of four neighbours, so
    // this number is large and expected. It is logged because a jump in it is
    // the cheapest sign that the feed's footprint moved.
    if (foreignInBbox > 0) {
      log(
        `${count(foreignInBbox)} of them are inside the Swiss bounding box anyway — it is a rectangle over four borders, and the country code is what decides`,
      );
    }

    if (misplaced.length === 0) {
      log(
        `every Swiss station is inside the bounding box, so the country code and the position agree`,
      );
    }

    for (const station of misplaced) {
      log(
        `station ${station.didok} ${station.name} at ${station.lat ?? '?'}, ${station.lon ?? '?'} — ${station.reason}`,
      );
    }

    return { stations, foreign: excluded, misplaced, foreignInBbox, feedStops };
  } finally {
    db.close();
  }
}
