import { describe, expect, it } from 'vitest';

import { EC, GELMERBAHN, S12, STATIONS } from '../emit/fixtures.ts';
import type { TerminiLine } from '../termini.ts';
import { renderReport } from './render.ts';
import type { ReportInput } from './render.ts';

/** A feed funicular, filed under its operator. */
const POLYBAHN: TerminiLine = {
  ...S12,
  id: 'polybahn:FUN-2350',
  category: 'FUN',
  number: 'FUN-2350',
  region: 'polybahn',
  operators: ['Poly-Bahn Zürich'],
  name: 'Standseilbahn Polybahn',
  nameSource: 'derived',
  review: ['unknown-operator'],
};

/** A construction replacement: four weeks of service and no shape. */
const SHORT_S5: TerminiLine = {
  ...S12,
  id: 's-bahn-zuerich:S5',
  number: 'S5',
  name: 'S5',
  serviceWeeks: 4,
  seasonal: true,
  hasGeometry: false,
  geometry: null,
  match: null,
};

const UNDRAWN_EC: TerminiLine = {
  ...EC,
  hasGeometry: false,
  geometry: null,
  match: null,
};

function input(overrides: Partial<ReportInput> = {}): ReportInput {
  return {
    feed: {
      id: 'otd-fp2026-20260919',
      source: 'opentransportdata',
      page: 'https://data.opentransportdata.swiss/en/dataset/timetable-2026-gtfs2020',
      filename: 'GTFS_FP2026_20260919.zip',
      issued: '2026-09-21T09:00:00+02:00',
    },
    osmBase: { train: '2026-09-21T08:00:00Z', funicular: '2026-09-21T08:05:00Z' },
    lines: [S12, SHORT_S5, UNDRAWN_EC, POLYBAHN, GELMERBAHN],
    regionNames: { fernverkehr: 'Long distance', 's-bahn-zuerich': 'S-Bahn Zürich (ZVV)' },
    stations: STATIONS,
    unmatched: [
      {
        id: UNDRAWN_EC.id,
        name: UNDRAWN_EC.name,
        reason: 'low-coverage',
        best: { rule: 'operator', confidence: 0.34, relations: [7] },
        lostTo: [],
      },
      { id: SHORT_S5.id, name: SHORT_S5.name, reason: 'no-candidate', best: null, lostTo: [] },
      {
        id: GELMERBAHN.id,
        name: GELMERBAHN.name,
        reason: 'contested',
        best: null,
        lostTo: [POLYBAHN.id],
      },
    ],
    suspect: [],
    inFeed: [],
    misplaced: [],
    unknownRoutes: [],
    ...overrides,
  };
}

function section(report: string, title: string): string {
  const start = report.indexOf(`## ${title}\n`);
  const end = report.indexOf('\n## ', start + 1);

  return report.slice(start, end === -1 ? undefined : end);
}

describe('renderReport', () => {
  it('names the feed and the OSM answers it was built from', () => {
    const report = renderReport(input());

    expect(report).toContain('| Feed | `otd-fp2026-20260919` |');
    expect(report).toContain('| Published | 2026-09-21 |');
    expect(report).toContain('| OSM, funicular | 2026-09-21T08:05:00Z |');
  });

  it('splits the total into trains and funiculars, feed and seeded apart', () => {
    const totals = section(renderReport(input()), 'Totals');

    expect(totals).toContain('**5 lines: 3 train lines and 2 funiculars.**');
    expect(totals).toContain('| From the feed | 3 | 1 | 4 |');
    expect(totals).toContain('| Seeded by hand | 0 | 1 | 1 |');
    expect(totals).toContain('| **All** | 3 | 2 | 5 |');
  });

  it('counts each category, busiest first', () => {
    const categories = section(renderReport(input()), 'By category');

    expect(categories).toContain('| `S` | 2 | 1 | 1 |');
    expect(categories.indexOf('`S`')).toBeLessThan(categories.indexOf('`EC`'));
    expect(categories.indexOf('`FUN`')).toBeLessThan(categories.indexOf('`EC`'));
  });

  it('names the declared regions and lists the operators behind the rest', () => {
    const regions = section(renderReport(input()), 'By region');

    expect(regions).toContain('| `s-bahn-zuerich` | S-Bahn Zürich (ZVV) | 2 | 0 | 2 |');
    expect(regions).toContain('| `polybahn` | Poly-Bahn Zürich | 0 | 1 | 1 |');
    expect(regions).toContain('| `kwo-seilbahnen` | KWO Seilbahnen | 0 | 1 | 1 |');
  });

  it('groups the lines with no shape by reason, with what each came closest to', () => {
    const unmatched = section(renderReport(input()), 'Lines with no OSM match');

    expect(unmatched).toContain('3 lines in all');
    expect(unmatched).toContain('| `no-candidate` | 1 | 1 |');
    expect(unmatched).toContain(`| \`${UNDRAWN_EC.id}\` | EC Brugg AG-Winterthur | \`EC\` | 52 | 34% |`);
    expect(unmatched).toContain(`| \`${GELMERBAHN.id}\` | Gelmerbahn | \`FUN\` | — | \`polybahn:FUN-2350\` |`);
  });

  it('folds a short-lived line away instead of listing it with the rest', () => {
    const unmatched = section(renderReport(input()), 'Lines with no OSM match');
    const noCandidate = unmatched.slice(unmatched.indexOf('### `no-candidate`'));

    expect(noCandidate).toMatch(/_Only short-lived lines\._\n\n<details>\n<summary>1 short-lived line, running in 8 weeks or fewer<\/summary>/);
    expect(noCandidate).toContain('| `s-bahn-zuerich:S5` | S5 | `S` | 4 |');
  });

  it('leaves out a reason no line has', () => {
    const report = renderReport(input({ unmatched: [] }));

    expect(report).toContain('0 lines in all');
    expect(report).not.toContain('### `contested`');
  });

  it('lists each part of a suspect line by its terminals’ names', () => {
    const report = renderReport(
      input({
        suspect: [
          {
            id: 's-bahn-zuerich:S12',
            parts: [
              { routeIds: ['a', 'b'], operators: ['SBB'], terminals: ['8500309', '8506000'] },
              { routeIds: ['c'], operators: ['Thurbo'], terminals: ['8503424', '8599999'] },
            ],
          },
        ],
      }),
    );
    const suspects = section(report, 'Possible duplicates');

    expect(suspects).toContain('### `s-bahn-zuerich:S12`');
    expect(suspects).toContain('| 1 | Brugg AG – Winterthur | SBB | 2 |');
    expect(suspects).toContain('| 2 | Schaffhausen – 8599999 | Thurbo | 1 |');
  });

  it('says so when there is nothing to review', () => {
    const report = renderReport(input());

    expect(section(report, 'Possible duplicates')).toContain('_None._');
    expect(section(report, 'Feed checks').match(/_None — the expected state\._/g)).toHaveLength(2);
  });

  it('lists flagged names apart from the other derived ones, and every seeded line', () => {
    const names = section(renderReport(input({ inFeed: [GELMERBAHN.id] })), 'Names to check by hand');

    expect(names).toContain('| `polybahn:FUN-2350` | Standseilbahn Polybahn | `unknown-operator` |');
    expect(names).toContain('1 derived name with no flag, each worth a glance.');
    expect(names).toContain(`| \`${UNDRAWN_EC.id}\` | EC Brugg AG-Winterthur | \`EC\` |`);
    expect(names).toContain(`| \`${GELMERBAHN.id}\` | Gelmerbahn | 2 | yes |`);
    expect(names).not.toContain('| `s-bahn-zuerich:S12` |');
  });

  it('lists doubted stations and unrecognised route types', () => {
    const feed = section(
      renderReport(
        input({
          misplaced: [
            {
              didok: '8500001',
              name: 'Nowhere',
              lat: 45.123456,
              lon: null,
              reason: 'no usable coordinate',
            },
          ],
          unknownRoutes: [
            { routeType: '1700', routeDesc: 'HOV', routes: 3, reason: 'not in the allowlist' },
          ],
        }),
      ),
      'Feed checks',
    );

    expect(feed).toContain('| `8500001` | Nowhere | 45.12346 | — | no usable coordinate |');
    expect(feed).toContain('| `1700` | `HOV` | 3 | not in the allowlist |');
  });

  it('writes the same bytes whatever order its inputs arrive in', () => {
    const shuffled = input();

    expect(
      renderReport({
        ...shuffled,
        lines: [...shuffled.lines].reverse(),
        unmatched: [...shuffled.unmatched].reverse(),
        osmBase: { funicular: shuffled.osmBase.funicular, train: shuffled.osmBase.train },
      }),
    ).toBe(renderReport(input()));
  });
});
