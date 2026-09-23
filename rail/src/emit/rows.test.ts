import { describe, expect, it } from 'vitest';

import { EC, GELMERBAHN, S12, STATIONS } from './fixtures.ts';
import { LINE_COLUMNS, lineRow, stopRows, toRecord } from './rows.ts';

const stations = new Map(STATIONS.map(station => [station.didok, station]));

describe('toRecord', () => {
  it('writes a feed line’s fields in column order, with its lists sorted by code unit', () => {
    const { stops, ...record } = toRecord(S12, stations);

    expect(Object.keys(record)).toEqual(LINE_COLUMNS);
    expect(record).toEqual({
      id: 's-bahn-zuerich:S12',
      display_name: 'S12',
      category: 'S',
      network_region: 's-bahn-zuerich',
      operators: ['BLS AG', 'Schweizerische Bundesbahnen SBB'],
      terminal_a: 'Brugg AG',
      terminal_b: 'Wil SG',
      true_terminal_a: 'Brugg AG',
      true_terminal_b: 'Wil SG',
      route_ids: ['91-12-j26-1', '91-12-j26-2'],
      seasonal: false,
      trips_per_week: 406,
      has_geometry: true,
    });
    expect(stops).toHaveLength(4);
  });

  it('numbers the stops from 1 in canonical order, branch block last', () => {
    const { stops } = toRecord(S12, stations);

    expect(
      stops.map(stop => [
        stop.sequence,
        stop.stop_name,
        stop.via,
        stop.junction,
      ]),
    ).toEqual([
      [1, 'Brugg AG', 'backbone', null],
      [2, 'Winterthur', 'backbone', null],
      [3, 'Wil SG', 'extension', '8506000'],
      [4, 'Schaffhausen', 'branch', '8506000'],
    ]);
  });

  it('carries a station’s SLOID and position, and null where the feed has none', () => {
    const { stops } = toRecord(S12, stations);

    expect(stops[0]).toMatchObject({
      sloid: 'ch:1:sloid:309',
      didok: '8500309',
      lat: 47.48086045,
      lon: 8.208841,
    });
    expect(stops[2]).toMatchObject({
      sloid: null,
      didok: '8506206',
      lat: null,
      lon: null,
    });
  });

  it('writes an international line’s true termini beside its Swiss ones', () => {
    const record = toRecord(EC, stations);

    expect([record.terminal_a, record.terminal_b]).toEqual([
      'Brugg AG',
      'Winterthur',
    ]);
    expect([record.true_terminal_a, record.true_terminal_b]).toEqual([
      'Brugg AG',
      'Stuttgart Hbf',
    ]);
  });

  it('keeps a seeded line’s own names and coordinates, and leaves its timetable empty', () => {
    const record = toRecord(GELMERBAHN, stations);

    expect(record).toMatchObject({
      route_ids: [],
      seasonal: null,
      trips_per_week: null,
      has_geometry: false,
    });
    expect(record.stops).toEqual([
      {
        sequence: 1,
        stop_name: 'Handegg',
        sloid: 'ch:1:sloid:31013',
        didok: '8531013',
        lat: 46.613585,
        lon: 8.308709,
        via: 'backbone',
        junction: null,
      },
      {
        sequence: 2,
        stop_name: 'Gelmersee',
        sloid: null,
        didok: null,
        lat: 46.614439,
        lon: 8.320473,
        via: 'backbone',
        junction: null,
      },
    ]);
  });

  it('stops when a feed stop is not a station the stations step kept', () => {
    const withoutWil = new Map(
      [...stations].filter(([didok]) => didok !== '8506206'),
    );

    expect(() => toRecord(S12, withoutWil)).toThrow(
      /s-bahn-zuerich:S12 stops at 8506206/,
    );
  });
});

describe('lineRow', () => {
  it('joins the lists into one cell each', () => {
    const row = lineRow(toRecord(S12, stations));

    expect(row.operators).toBe('BLS AG;Schweizerische Bundesbahnen SBB');
    expect(row.route_ids).toBe('91-12-j26-1;91-12-j26-2');
    expect(row).not.toHaveProperty('stops');
  });
});

describe('stopRows', () => {
  it('puts the line’s id in front of every stop', () => {
    const rows = stopRows(toRecord(GELMERBAHN, stations));

    expect(rows.map(row => [row.line_id, row.sequence])).toEqual([
      [GELMERBAHN.id, 1],
      [GELMERBAHN.id, 2],
    ]);
  });
});
