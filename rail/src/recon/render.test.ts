import { describe, expect, it } from 'vitest';

import { render } from './render.ts';
import type { Findings } from './render.ts';

/**
 * The renderer is where the report's conclusions are drawn, so these are tests
 * of the conclusions rather than of the formatting: given rows that say the
 * assumption held, does the report say so, and given rows that say it did not,
 * does the report say that instead.
 */

const MEMBERS = ['agency.txt', 'routes.txt', 'trips.txt'];

function findings(overrides: Partial<Findings> = {}): Findings {
  return {
    feed: {
      id: 'otd-fp2026-20260919',
      source: 'opentransportdata',
      page: 'https://data.opentransportdata.swiss/en/dataset/timetable-2026-gtfs2020',
      filename: 'GTFS_FP2026_20260919.zip',
      issued: '2026-09-21T09:00:00+02:00',
      sha256: 'dbdcbb06',
      bytes: 256_100_000,
      members: MEMBERS,
    },
    categories: [
      { route_type: '109', route_desc: 'S', routes: 2, trips: 40, agencies: 1 },
      { route_type: '1400', route_desc: 'FUN', routes: 1, trips: 5, agencies: 1 },
    ],
    combinations: [
      {
        route_type: '109',
        route_desc: 'S',
        agency_id: '11',
        agency_name: 'SBB',
        routes: 2,
        trips: 40,
      },
    ],
    samples: [
      {
        route_id: '91-2A-Y-j26-1',
        route_type: '102',
        route_desc: 'EC',
        route_short_name: 'EC',
        route_long_name: null,
        agency_name: 'SBB',
        trip_short_name: '10',
        headsigns: 16,
        headsign: 'Milano',
        trips: 1081,
      },
    ],
    agencies: [
      {
        agency_id: '11',
        agency_name: 'SBB',
        routes: 3,
        category_only: 1,
        long_name: 0,
        distinct_short_names: 3,
        trip_short_name_per_route: 41.9,
        trips: 45,
      },
    ],
    funiculars: [
      {
        route_type: '1400',
        route_desc: 'FUN',
        agency_name: 'Poly-Bahn Zürich',
        route_short_name: '24',
        route_id: '93-24-j26-1',
        trips: 5,
      },
    ],
    mistyped: [],
    variants: [
      { y_variant: true, category_only: true, routes: 1 },
      { y_variant: false, category_only: false, routes: 3 },
    ],
    exceptions: [],
    operators: [
      {
        needle: 'Poly',
        matches: [
          {
            agency_id: '165',
            agency_name: 'Poly-Bahn Zürich',
            route_types: '1400',
            routes: 1,
          },
        ],
      },
    ],
    mirror: {
      ok: true,
      url: 'https://gtfs.geops.ch/dl/gtfs_complete.zip',
      archiveBytes: 193_840_797,
      entries: MEMBERS,
    },
    ...overrides,
  };
}

describe('render', () => {
  it('identifies the publication it describes', () => {
    const report = render(findings());

    expect(report).toContain('otd-fp2026-20260919');
    expect(report).toContain('GTFS_FP2026_20260919.zip');
    expect(report).toContain('dbdcbb06');
  });

  /** A wall-clock stamp would make every rerun a diff and hide the feed changes. */
  it('carries nothing that changes between two runs of the same feed', () => {
    expect(render(findings())).toBe(render(findings()));
    expect(render(findings())).not.toMatch(new RegExp(String(new Date().getFullYear() + 1)));
  });

  it('answers every one of the issue\'s six questions under its own heading', () => {
    const report = render(findings());

    for (const heading of [
      '## 1. Route types, categories and operators',
      '## 2. Routes whose short name is only a category',
      '## 3. Which field carries the passenger-facing line number',
      '## 4. Is there a `shapes.txt`',
      '## 5. Are all funiculars `route_type` 1400',
      '## 6. Do the privately run funiculars appear at all',
    ]) {
      expect(report).toContain(heading);
    }
  });

  it('leaves a blank line between prose and every table', () => {
    const lines = render(findings()).split('\n');

    lines.forEach((line, index) => {
      if (line.startsWith('| ') && !lines[index - 1]?.startsWith('|')) {
        expect(lines[index - 1]).toBe('');
      }
    });
  });
});

describe('contradictions', () => {
  it('records a missing shapes.txt and reverses the README on geometry', () => {
    const report = render(findings());

    expect(report).toContain('OpenStreetMap is the primary geometry source, not a fallback');
    expect(report).toContain('**Neither GTFS source ships geometry.**');
  });

  it('says nothing about geometry when the feed does ship shapes', () => {
    const report = render(
      findings({ feed: { ...findings().feed, members: [...MEMBERS, 'shapes.txt'] } }),
    );

    expect(report).toContain('**The feed has geometry.**');
    expect(report).not.toContain('OpenStreetMap is the primary geometry source');
  });

  it('records that route_long_name is empty rather than sparse', () => {
    expect(render(findings())).toContain('`route_long_name` is empty on every route');
  });

  it('drops that one once an operator starts populating route_long_name', () => {
    const agencies = [{ ...findings().agencies[0], long_name: 2 }];

    expect(render(findings({ agencies }))).not.toContain('is empty on every route');
  });

  it('records the overlap between the 100-117 include range and the EXT exclusion', () => {
    const categories = [
      ...findings().categories,
      { route_type: '117', route_desc: 'EXT', routes: 110, trips: 1771, agencies: 16 },
    ];

    expect(render(findings({ categories }))).toContain('`EXT` is `route_type` 117, 110 routes');
  });

  it('says so plainly when nothing contradicts the brief', () => {
    const feed = { ...findings().feed, members: [...MEMBERS, 'shapes.txt'] };
    const agencies = [{ ...findings().agencies[0], long_name: 3 }];

    expect(render(findings({ feed, agencies }))).toContain(
      'None. Every assumption in `README.md` that this recon could test held.',
    );
  });
});

describe('the funicular and operator answers', () => {
  it('clears 1300 for exclusion when no operator name disagrees', () => {
    expect(render(findings())).toContain('1300 can be excluded wholesale');
  });

  it('asks for a hand decision when one does', () => {
    const mistyped = [
      {
        route_type: '1300',
        route_desc: 'SL',
        agency_name: 'Funiculaire St-Luc-Chandolin',
        route_short_name: 'SL',
        route_id: '93-2G-Y-j26-1',
        trips: 1,
      },
    ];

    const report = render(findings({ mistyped }));

    expect(report).toContain('**1 route outside 1400 belongs to an operator');
    expect(report).not.toContain('1300 can be excluded wholesale');
  });

  it('reports a funicular that is absent from the feed as what #476 is for', () => {
    const operators = [...findings().operators, { needle: 'Gurtenbahn', matches: [] }];
    const report = render(findings({ operators }));

    expect(report).toContain('**1 operator of the ones searched for is absent**');
    expect(report).toContain("#476's seed file");
  });
});

describe('the mirror probe', () => {
  it('prints the reason rather than the answer when the mirror could not be read', () => {
    const mirror = {
      ok: false as const,
      url: 'https://gtfs.geops.ch/dl/gtfs_complete.zip',
      reason: 'asked for bytes=-66560 and got 200, not 206 Partial Content',
    };

    const report = render(findings({ mirror }));

    expect(report).toContain('could not be checked — asked for bytes=-66560');
    expect(report).toContain('The geOps mirror could not be checked.');
  });
});

describe('table cells', () => {
  it('escapes a pipe in operator-supplied text', () => {
    const funiculars = [{ ...findings().funiculars[0], agency_name: 'A | B' }];

    expect(render(findings({ funiculars }))).toContain('A \\| B');
  });

  it('renders an empty field as a dash rather than as nothing', () => {
    expect(render(findings())).toContain('| — |');
  });
});
