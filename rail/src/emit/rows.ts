/**
 * What goes into the artifacts, as pure functions from lines to records.
 *
 * One record per line, nested with its stops, is what `lines.json` holds; the two
 * CSVs are the same records flattened. Building both from one record is what
 * keeps them from disagreeing, and it is why the schema that checks the JSON
 * checks the CSVs as well.
 *
 * Field names are `snake_case` in all three files, because they are the column
 * names of `rail_lines` and `rail_line_stops`, and a consumer should not have to
 * translate between files that say the same thing. Every record is built key by
 * key in a fixed order rather than spread from the line, so a field added to a
 * line upstream never reaches an artifact by accident and never reorders one.
 */

import type { Category } from '../allowlist/categories.ts';
import { compare } from '../merge/key.ts';
import type { Via } from '../sequence/order.ts';
import type { Station } from '../stations.ts';
import type { TerminiLine } from '../termini.ts';
import { list } from './csv.ts';

export type StopRecord = {
  /** From 1, in canonical order: the trunk, then each branch block. */
  sequence: number;
  stop_name: string;
  sloid: string | null;
  /** `null` only for a hand-seeded stop the service-point register does not know. */
  didok: string | null;
  lat: number | null;
  lon: number | null;
  via: Via;
  /** The Didok number of the stop it was placed against, as in `sequence/order.ts`. */
  junction: string | null;
};

export type LineRecord = {
  id: string;
  display_name: string;
  category: Category;
  /** The region slug, which is also the part of the id before the colon. */
  network_region: string;
  operators: string[];
  terminal_a: string;
  terminal_b: string;
  true_terminal_a: string;
  true_terminal_b: string;
  route_ids: string[];
  /** `null` on a hand-seeded line, which has no timetable to count. */
  seasonal: boolean | null;
  trips_per_week: number | null;
  has_geometry: boolean;
  stops: StopRecord[];
};

export type LineRow = Omit<LineRecord, 'operators' | 'route_ids' | 'stops'> & {
  operators: string;
  route_ids: string;
};

export type StopRow = { line_id: string } & StopRecord;

export const LINE_COLUMNS = [
  'id',
  'display_name',
  'category',
  'network_region',
  'operators',
  'terminal_a',
  'terminal_b',
  'true_terminal_a',
  'true_terminal_b',
  'route_ids',
  'seasonal',
  'trips_per_week',
  'has_geometry',
] as const satisfies readonly (keyof LineRow)[];

export const STOP_COLUMNS = [
  'line_id',
  'sequence',
  'stop_name',
  'sloid',
  'didok',
  'lat',
  'lon',
  'via',
  'junction',
] as const satisfies readonly (keyof StopRow)[];

function feedStops(
  line: Extract<TerminiLine, { source: 'feed' }>,
  stations: ReadonlyMap<string, Station>,
): StopRecord[] {
  return line.sequence.map((stop, index) => {
    const station = stations.get(stop.didok);

    if (station === undefined) {
      throw new Error(
        `line ${line.id} stops at ${stop.didok}, which the stations step does not have; the steps no longer describe the same feed`,
      );
    }

    return {
      sequence: index + 1,
      stop_name: station.name,
      sloid: station.sloid,
      didok: station.didok,
      lat: station.lat,
      lon: station.lon,
      via: stop.via,
      junction: stop.junction,
    };
  });
}

/**
 * A seeded line lists its stops in running order with the coordinates it was
 * written with, which stay: they were checked by hand. The SLOID is the one
 * thing the seed file does not carry, and comes from the feed's stops when the
 * Didok number is one the feed knows.
 */
function manualStops(
  line: Extract<TerminiLine, { source: 'manual' }>,
  stations: ReadonlyMap<string, Station>,
): StopRecord[] {
  return line.stops.map((stop, index) => ({
    sequence: index + 1,
    stop_name: stop.name,
    sloid:
      (stop.didok === undefined
        ? undefined
        : stations.get(stop.didok)?.sloid) ?? null,
    didok: stop.didok ?? null,
    lat: stop.lat,
    lon: stop.lon,
    via: 'backbone',
    junction: null,
  }));
}

export function toRecord(
  line: TerminiLine,
  stations: ReadonlyMap<string, Station>,
): LineRecord {
  return {
    id: line.id,
    display_name: line.name,
    category: line.category,
    network_region: line.region,
    operators: [...line.operators].sort(compare),
    terminal_a: line.termini[0].name,
    terminal_b: line.termini[1].name,
    true_terminal_a: line.trueTermini[0].name,
    true_terminal_b: line.trueTermini[1].name,
    route_ids: [...line.routeIds].sort(compare),
    seasonal: line.seasonal,
    trips_per_week: line.tripsPerWeek,
    has_geometry: line.hasGeometry,
    stops:
      line.source === 'feed'
        ? feedStops(line, stations)
        : manualStops(line, stations),
  };
}

export function lineRow(record: LineRecord): LineRow {
  return {
    id: record.id,
    display_name: record.display_name,
    category: record.category,
    network_region: record.network_region,
    operators: list(record.operators, 'operators'),
    terminal_a: record.terminal_a,
    terminal_b: record.terminal_b,
    true_terminal_a: record.true_terminal_a,
    true_terminal_b: record.true_terminal_b,
    route_ids: list(record.route_ids, 'route_ids'),
    seasonal: record.seasonal,
    trips_per_week: record.trips_per_week,
    has_geometry: record.has_geometry,
  };
}

export function stopRows(record: LineRecord): StopRow[] {
  return record.stops.map(stop => ({
    line_id: record.id,
    sequence: stop.sequence,
    stop_name: stop.stop_name,
    sloid: stop.sloid,
    didok: stop.didok,
    lat: stop.lat,
    lon: stop.lon,
    via: stop.via,
    junction: stop.junction,
  }));
}
