/**
 * Small rows for the reconcile's tests: two lines with a stop or two each, as
 * the feed has them and as the database holds them.
 */

import type { DbLine, DbStop, FeedLine, FeedStop, Tracked } from './rows.ts';

export const IR35: FeedLine = {
  id: 'fernverkehr:IR35',
  display_name: 'IR35',
  category: 'IR',
  network_region: 'fernverkehr',
  operators: ['BLS AG', 'SBB'],
  terminal_a: 'Bern',
  terminal_b: 'Luzern',
  true_terminal_a: 'Bern',
  true_terminal_b: 'Luzern',
  route_ids: ['91-35-j26-1'],
  seasonal: false,
  trips_per_week: 196,
  has_geometry: true,
};

export const S12: FeedLine = {
  ...IR35,
  id: 's-bahn-zuerich:S12',
  display_name: 'S12',
  category: 'S',
  network_region: 's-bahn-zuerich',
  operators: ['SBB'],
  terminal_a: 'Brugg AG',
  terminal_b: 'Wil SG',
  true_terminal_a: 'Brugg AG',
  true_terminal_b: 'Wil SG',
  route_ids: ['91-12-j26-1'],
  trips_per_week: 700,
};

export function stop(line: FeedLine, sequence: number, stop_name: string): FeedStop {
  return {
    line_id: line.id,
    sequence,
    stop_name,
    sloid: null,
    didok: String(8500000 + sequence),
    lat: 47,
    lon: 8,
    via: 'backbone',
    junction: null,
  };
}

const UNTOUCHED: Tracked = { edited_fields: [], missing_since: null };

/**
 * A row as the database holds it: a copy, so a test that edits it cannot edit
 * the feed row it came from.
 */
export function stored<Row extends FeedLine | FeedStop>(
  row: Row,
  tracked: Partial<Tracked> = {},
): Row & Tracked {
  return structuredClone({ ...row, ...UNTOUCHED, ...tracked });
}

export function storedLine(line: FeedLine, tracked?: Partial<Tracked>): DbLine {
  return stored(line, tracked);
}

export function storedStop(stopRow: FeedStop, tracked?: Partial<Tracked>): DbStop {
  return stored(stopRow, tracked);
}
