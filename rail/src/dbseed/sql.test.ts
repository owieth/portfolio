import { describe, expect, it } from 'vitest';

import { parseCsv } from '../diff/csv.ts';
import { renderSeed } from './sql.ts';

const LINES = parseCsv(
  [
    'id,display_name,category,network_region,operators,terminal_a,terminal_b,true_terminal_a,true_terminal_b,route_ids,seasonal,trips_per_week,has_geometry',
    'fernverkehr:IR35,IR35,IR,fernverkehr,BLS AG;SBB,Bern,Luzern,Bern,Luzern,a-j26;b-j26,false,196,true',
    "zermatt:FUN-1,Sunnegga,FUN,zermatt,Zermatt Bergbahnen,L'Arrivée,Sunnegga,L'Arrivée,Sunnegga,,,,false",
    '',
  ].join('\n'),
);

const STOPS = parseCsv(
  [
    'line_id,sequence,stop_name,sloid,didok,lat,lon,via,junction',
    'fernverkehr:IR35,1,Bern,ch:1:sloid:7000,8507000,46.94883,7.43913,backbone,',
    'fernverkehr:IR35,2,Luzern,,8505000,-47.05,8.31,branch,8507000',
    '',
  ].join('\n'),
);

function statements(sql: string): string[] {
  return sql
    .split('\n')
    .filter(line => !line.startsWith('--') && line !== '')
    .join('\n')
    .split(';\n')
    .filter(Boolean);
}

describe('renderSeed', () => {
  const sql = renderSeed(LINES, STOPS);

  it('inserts the lines before the stops that reference them', () => {
    const [lines, stops] = statements(sql);

    expect(lines).toMatch(
      /^insert into public\.rail_lines \(id, display_name, category,/,
    );
    expect(stops).toMatch(/^insert into public\.rail_line_stops \(line_id, sequence,/);
  });

  it('skips a row that is already there instead of overwriting it', () => {
    expect(sql).toContain('on conflict (id) do nothing;');
    expect(sql).toContain('on conflict (line_id, sequence) do nothing;');
  });

  it('writes lists as arrays and an empty list as an empty array', () => {
    expect(sql).toContain(
      "('fernverkehr:IR35', 'IR35', 'IR', 'fernverkehr', array['BLS AG', 'SBB'], 'Bern', 'Luzern', 'Bern', 'Luzern', array['a-j26', 'b-j26'], false, 196, true)",
    );
    expect(sql).toContain("'Sunnegga', '{}', null, null, false)");
  });

  it('doubles a quote inside text', () => {
    expect(sql).toContain("'L''Arrivée'");
  });

  it('writes numbers bare and an empty field as null', () => {
    expect(sql).toContain(
      "('fernverkehr:IR35', 1, 'Bern', 'ch:1:sloid:7000', '8507000', 46.94883, 7.43913, 'backbone', null)",
    );
    expect(sql).toContain("null, '8505000', -47.05, 8.31, 'branch', '8507000')");
  });

  it('writes the same bytes for the same rows', () => {
    expect(renderSeed(LINES, STOPS)).toBe(sql);
  });

  it('refuses a cell that is not its column’s type', () => {
    const [line] = LINES;

    expect(() => renderSeed([{ ...line, trips_per_week: 'many' }], [])).toThrow(
      'lines.csv row 2 trips_per_week is "many", which is not an integer',
    );
    expect(() => renderSeed([{ ...line, seasonal: 'yes' }], [])).toThrow('not a boolean');
    expect(() => renderSeed([], [{ ...STOPS[0], lat: '46,9' }])).toThrow('not a number');
  });

  it('refuses a file that is missing a column', () => {
    const line = Object.fromEntries(
      Object.entries(LINES[0]).filter(([column]) => column !== 'has_geometry'),
    );

    expect(() => renderSeed([line], [])).toThrow('lines.csv has no has_geometry column');
  });
});
