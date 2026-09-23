import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { Category } from './allowlist/categories.ts';
import { LINES_JSON } from './emit.ts';
import type { LineRecord, StopRecord } from './emit/rows.ts';
import { RAIL_DIR } from './paths.ts';
import { SPOT_CHECKS, assertSpotChecks, spotCheck } from './spotcheck.ts';

const committed: { lines: LineRecord[] } = JSON.parse(
  await readFile(join(RAIL_DIR, LINES_JSON), 'utf8'),
);

describe(`the committed ${LINES_JSON}`, () => {
  it.each(SPOT_CHECKS)('$line: expected $expectation', ({ check }) => {
    expect(check(committed.lines)).toBeNull();
  });
});

function stop(didok: string, stop_name: string): StopRecord {
  return {
    sequence: 1,
    stop_name,
    sloid: null,
    didok,
    lat: null,
    lon: null,
    via: 'backbone',
    junction: null,
  };
}

function line(
  id: string,
  display_name: string,
  category: Category,
  [terminal_a, terminal_b]: [string, string],
  overrides: Partial<LineRecord> = {},
): LineRecord {
  return {
    id,
    display_name,
    category,
    network_region: id.split(':')[0] ?? '',
    operators: ['Schweizerische Bundesbahnen SBB'],
    terminal_a,
    terminal_b,
    true_terminal_a: terminal_a,
    true_terminal_b: terminal_b,
    route_ids: [],
    seasonal: false,
    trips_per_week: 1,
    has_geometry: true,
    stops: [],
    ...overrides,
  };
}

const VITZNAU = stop('8508464', 'Vitznau');
const ARTH_GOLDAU_RB = stop('8505063', 'Arth-Goldau RB');
const RIGI_KULM = stop('8505069', 'Rigi Kulm');
const PILATUS_KULM = stop('8508456', 'Pilatus Kulm');

const RIGI_OPERATOR = { operators: ['Rigi Bahnen AG'] };

const KNOWN: LineRecord[] = [
  line('fernverkehr:IC1', 'IC1', 'IC', ['Genève-Aéroport', 'St. Gallen']),
  line('fernverkehr:IR15', 'IR15', 'IR', ['Genève-Aéroport', 'Luzern']),
  line('s-bahn-zuerich:S10', 'S10', 'S', ['Zürich HB', 'Uetliberg'], {
    operators: ['Sihltal-Zürich-Uetliberg-Bahn'],
  }),
  line('tilo:S10', 'S10', 'S', ['Airolo', 'Chiasso']),
  line('s-bahn-st-gallen:S10', 'S10', 'S', ['Romanshorn', 'Wil SG']),
  line('rigi-bahnen-ag:CC-81', 'CC 81', 'CC', ['Arth-Goldau RB', 'Rigi Kulm'], {
    ...RIGI_OPERATOR,
    stops: [ARTH_GOLDAU_RB, RIGI_KULM],
  }),
  line('rigi-bahnen-ag:CC-82', 'CC 82', 'CC', ['Rigi Kulm', 'Vitznau'], {
    ...RIGI_OPERATOR,
    stops: [RIGI_KULM, VITZNAU],
  }),
  line('rigi-bahnen-ag:CC-88', 'CC 88', 'CC', ['Rigi Kulm', 'Vitznau'], {
    ...RIGI_OPERATOR,
    stops: [RIGI_KULM, VITZNAU],
  }),
  line('pilatusbahnen:CC-R83', 'CC R83', 'CC', ['Pilatus Kulm', 'Alpnachstad PB'], {
    operators: ['Pilatusbahnen'],
    seasonal: true,
    stops: [PILATUS_KULM, stop('8508458', 'Alpnachstad PB')],
  }),
  line(
    'poly-bahn-zuerich:FUN-24',
    'Standseilbahn Polybahn',
    'FUN',
    ['Zürich Central (Polybahn)', 'Zürich Polyterrasse'],
    { operators: ['Poly-Bahn Zürich'] },
  ),
];

function without(id: string): LineRecord[] {
  return KNOWN.filter(record => record.id !== id);
}

function changed(id: string, overrides: Partial<LineRecord>): LineRecord[] {
  return KNOWN.map(record => (record.id === id ? { ...record, ...overrides } : record));
}

describe('spotCheck', () => {
  it('passes the known lines', () => {
    expect(spotCheck(KNOWN)).toEqual([]);
  });

  it('names the line and the expectation when a line is missing', () => {
    expect(spotCheck(without('fernverkehr:IC1'))).toEqual([
      'IC1: expected fernverkehr:IC1 from Genève-Aéroport to St. Gallen, but there is no line fernverkehr:IC1',
    ]);
  });

  it('accepts the terminals in either order', () => {
    expect(
      spotCheck(changed('fernverkehr:IC1', { terminal_a: 'St. Gallen', terminal_b: 'Genève-Aéroport' })),
    ).toEqual([]);
  });

  it('says what a line runs when its terminals are wrong', () => {
    expect(spotCheck(changed('fernverkehr:IR15', { terminal_b: 'Basel SBB' }))).toEqual([
      'IR15: expected fernverkehr:IR15 from Genève-Aéroport to Luzern, but fernverkehr:IR15 runs Genève-Aéroport to Basel SBB',
    ]);
  });

  it('says how a line is named when its name is wrong', () => {
    expect(
      spotCheck(changed('poly-bahn-zuerich:FUN-24', { display_name: 'Standseilbahn Poly-Bahn Zürich' })),
    ).toEqual([
      'Polybahn: expected poly-bahn-zuerich:FUN-24 from Zürich Central (Polybahn) to Zürich Polyterrasse, but poly-bahn-zuerich:FUN-24 is named Standseilbahn Poly-Bahn Zürich',
    ]);
  });

  it('fails when the Zürich S10 splits by operator', () => {
    const split = [
      ...KNOWN,
      line('s-bahn-zuerich:S10-SBB', 'S10', 'S', ['Zürich HB', 'Uetliberg']),
    ];

    expect(spotCheck(split)).toEqual([
      'S10 (Uetlibergbahn): expected one line, s-bahn-zuerich:S10 from Zürich HB to Uetliberg, run by SZU, but there are 2: s-bahn-zuerich:S10, s-bahn-zuerich:S10-SBB',
    ]);
  });

  it('fails when the three S10s fuse into one', () => {
    const fused = KNOWN.filter(record => record.id !== 'tilo:S10' && record.id !== 's-bahn-st-gallen:S10');

    expect(spotCheck(fused)).toEqual([
      'S10 (Ticino and St. Gallen): expected tilo:S10 and s-bahn-st-gallen:S10 to stay lines of their own, but there is no line tilo:S10 or s-bahn-st-gallen:S10',
    ]);
  });

  it('fails when the two Rigi lines fuse', () => {
    const fused = changed('rigi-bahnen-ag:CC-81', {
      stops: [ARTH_GOLDAU_RB, RIGI_KULM, VITZNAU],
    });

    expect(spotCheck(fused)).toEqual([
      'Rigi rack railways: expected two lines, not one, and no other Rigi Bahnen line than rigi-bahnen-ag:CC-88, but rigi-bahnen-ag:CC-81 stops at both Vitznau and Arth-Goldau RB',
    ]);
  });

  it('fails on a Rigi Bahnen line nobody has accounted for', () => {
    const extra = [
      ...KNOWN,
      line('rigi-bahnen-ag:CC-89', 'CC 89', 'CC', ['Rigi Kulm', 'Rigi Staffel'], RIGI_OPERATOR),
    ];

    expect(spotCheck(extra)).toEqual([
      'Rigi rack railways: expected two lines, not one, and no other Rigi Bahnen line than rigi-bahnen-ag:CC-88, but there is also rigi-bahnen-ag:CC-89',
    ]);
  });

  it('fails when a Rigi cableway gets in, whatever its category', () => {
    const cableway = [
      ...KNOWN,
      line('weggis-rigi-kaltbad:CC-LWRK', 'CC LWRK', 'CC', ['Weggis (Luftseilbahn)', 'Rigi Kaltbad (Luftseilbahn)'], {
        stops: [stop('8530388', 'Weggis (Luftseilbahn)'), stop('8530687', 'Rigi Kaltbad (Luftseilbahn)')],
      }),
    ];

    expect(spotCheck(cableway)).toEqual([
      'Rigi aerial cableways: expected no line to stop where only a Rigi cableway does, but weggis-rigi-kaltbad:CC-LWRK stops at Weggis (Luftseilbahn), weggis-rigi-kaltbad:CC-LWRK stops at Rigi Kaltbad (Luftseilbahn)',
    ]);
  });

  it('fails when the Pilatus is not seasonal', () => {
    expect(spotCheck(changed('pilatusbahnen:CC-R83', { seasonal: false }))).toEqual([
      'Pilatus rack railway: expected pilatusbahnen:CC-R83 from Alpnachstad PB to Pilatus Kulm, seasonal, but pilatusbahnen:CC-R83 has seasonal false',
    ]);
  });

  it('fails when the Pilatus gondola gets in', () => {
    const gondola = [
      ...KNOWN,
      line('pilatusbahnen:FUN-GB', 'Standseilbahn Pilatus', 'FUN', ['Fräkmüntegg', 'Pilatus Kulm'], {
        stops: [stop('8508455', 'Fräkmüntegg'), PILATUS_KULM],
      }),
    ];

    expect(spotCheck(gondola)).toEqual([
      'Pilatus gondola: expected no line to Krienseregg or Fräkmüntegg, and only the rack railway at Pilatus Kulm, but pilatusbahnen:FUN-GB stops at Fräkmüntegg',
    ]);
  });

  it('fails when anything else stops at Pilatus Kulm', () => {
    const dragon = [
      ...KNOWN,
      line('pilatusbahnen:FUN-DR', 'Standseilbahn Pilatus', 'FUN', ['Pilatus Kulm', 'Pilatus Kulm'], {
        stops: [PILATUS_KULM],
      }),
    ];

    expect(spotCheck(dragon)).toEqual([
      'Pilatus gondola: expected no line to Krienseregg or Fräkmüntegg, and only the rack railway at Pilatus Kulm, but pilatusbahnen:FUN-DR stops at Pilatus Kulm',
    ]);
  });

  it.each([
    ['B', 'bus'],
    ['T', 'tram'],
    ['M', 'metro'],
    ['BAT', 'boat'],
    ['PB', 'aerial cable car'],
    ['GB', 'gondola'],
  ])('names a %s line and why it does not belong', (category, reason) => {
    const leaked = [
      ...KNOWN,
      line(`somewhere:${category}-1`, `${category} 1`, category as Category, ['A', 'B']),
    ];

    expect(spotCheck(leaked)).toEqual([
      `Every line: expected a train, rack railway or funicular — no bus, tram, metro, boat or cable car, but somewhere:${category}-1 is ${category} (${reason})`,
    ]);
  });

  it('names a category the allowlist has never heard of', () => {
    const leaked = [...KNOWN, line('somewhere:X-1', 'X 1', 'X' as Category, ['A', 'B'])];

    expect(spotCheck(leaked)).toEqual([
      'Every line: expected a train, rack railway or funicular — no bus, tram, metro, boat or cable car, but somewhere:X-1 is X (not a category the allowlist includes)',
    ]);
  });
});

describe('assertSpotChecks', () => {
  it('passes the known lines', () => {
    expect(() => assertSpotChecks(KNOWN)).not.toThrow();
  });

  it('lists every failure, each on its own line', () => {
    expect(() => assertSpotChecks(without('fernverkehr:IC1').filter(record => record.id !== 'fernverkehr:IR15')))
      .toThrow(
        `2 of ${SPOT_CHECKS.length} spot checks failed, so nothing was written:\n  IC1: expected fernverkehr:IC1 from Genève-Aéroport to St. Gallen, but there is no line fernverkehr:IC1\n  IR15: expected fernverkehr:IR15 from Genève-Aéroport to Luzern, but there is no line fernverkehr:IR15`,
      );
  });
});
