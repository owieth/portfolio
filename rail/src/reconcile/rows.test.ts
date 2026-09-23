import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { parseCsv } from '../diff/csv.ts';
import { RAIL_DIR } from '../paths.ts';
import { feedLine, feedOf, feedStop } from './rows.ts';

const LINE = {
  id: 'fernverkehr:IR35',
  display_name: 'IR35',
  category: 'IR',
  network_region: 'fernverkehr',
  operators: 'BLS AG;SBB',
  terminal_a: 'Bern',
  terminal_b: 'Luzern',
  true_terminal_a: 'Bern',
  true_terminal_b: 'Luzern',
  route_ids: 'a-j26;b-j26',
  seasonal: 'false',
  trips_per_week: '196',
  has_geometry: 'true',
};

const STOP = {
  line_id: 'fernverkehr:IR35',
  sequence: '2',
  stop_name: 'Luzern',
  sloid: null,
  didok: '8505000',
  lat: '47.05',
  lon: '-8.31',
  via: 'branch',
  junction: '8507000',
};

describe('feedLine', () => {
  it('reads lists, flags and counts as their types', () => {
    expect(feedLine(LINE, 0)).toEqual({
      ...LINE,
      operators: ['BLS AG', 'SBB'],
      route_ids: ['a-j26', 'b-j26'],
      seasonal: false,
      trips_per_week: 196,
      has_geometry: true,
    });
  });

  it('reads an empty list as an empty array and an empty count as null', () => {
    expect(
      feedLine({ ...LINE, route_ids: null, seasonal: null, trips_per_week: null }, 0),
    ).toMatchObject({ route_ids: [], seasonal: null, trips_per_week: null });
  });

  it('names the row and column of a cell that is not its type', () => {
    expect(() => feedLine({ ...LINE, trips_per_week: '1.5' }, 3)).toThrow(
      'lines.csv row 5 trips_per_week is "1.5", which is not an integer',
    );
    expect(() => feedLine({ ...LINE, has_geometry: 'yes' }, 0)).toThrow('not a boolean');
  });

  it('refuses an empty required cell and a missing column', () => {
    expect(() => feedLine({ ...LINE, display_name: null }, 0)).toThrow(
      'lines.csv row 2 display_name is empty',
    );

    const row = Object.fromEntries(
      Object.entries(LINE).filter(([column]) => column !== 'category'),
    );
    expect(() => feedLine(row, 0)).toThrow('lines.csv row 2 has no category column');
  });
});

describe('feedStop', () => {
  it('reads the sequence and coordinates as numbers and keeps nulls', () => {
    expect(feedStop(STOP, 0)).toEqual({ ...STOP, sequence: 2, lat: 47.05, lon: -8.31 });
  });

  it('refuses a coordinate that is not a number', () => {
    expect(() => feedStop({ ...STOP, lat: '47,05' }, 0)).toThrow(
      'line_stops.csv row 2 lat is "47,05", which is not a number',
    );
  });
});

describe('feedOf', () => {
  it('reads the committed CSVs without an error', async () => {
    const read = async (file: string) =>
      parseCsv(await readFile(join(RAIL_DIR, file), 'utf8'));
    const feed = feedOf(await read('lines.csv'), await read('line_stops.csv'));

    expect(feed.lines.length).toBeGreaterThan(0);
    expect(feed.stops.length).toBeGreaterThan(feed.lines.length);
  });
});
