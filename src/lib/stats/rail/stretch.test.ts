import type { Position } from 'geojson';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  rideStretches,
  sliceLine,
  wholeLineIds,
} from '@/lib/stats/rail/stretch';
import type {
  RailLine,
  RailRide,
  RailRideCoverage,
  RailStop,
} from '@/lib/stats/rail/types';

/**
 * A line along the 47th parallel from 7.00 to 7.04, with a junction at 7.02
 * and a branch north from it to 47.02. Three parts, as the pipeline leaves a
 * junction: the trunk either side of it, and the branch. The east trunk part
 * is stored running west, against the stops, as a part may be.
 */
const WEST: Position[] = [
  [7, 47],
  [7.01, 47],
  [7.02, 47],
];
const EAST: Position[] = [
  [7.04, 47],
  [7.03, 47],
  [7.02, 47],
];
const BRANCH: Position[] = [
  [7.02, 47],
  [7.02, 47.01],
  [7.02, 47.02],
];
const PARTS = [WEST, EAST, BRANCH];

const at = (lon: number, lat = 47) => ({ lat, lon });

/** The same track the other way round: the runs reversed, and each run too. */
const reversed = (coordinates: Position[][]) =>
  [...coordinates].reverse().map((run) => [...run].reverse());

const line = (id: string): RailLine => ({
  id,
  displayName: id,
  category: 'S',
  networkRegion: 'test',
  operators: ['SBB'],
  terminalA: 'A',
  terminalB: 'B',
  trueTerminalA: 'A',
  trueTerminalB: 'B',
  seasonal: false,
  tripsPerWeek: 100,
  hasGeometry: true,
  missingSince: null,
});

const stop = (
  lineId: string,
  sequence: number,
  didok: string,
  position: { lat: number; lon: number } | null,
): RailStop => ({
  lineId,
  sequence,
  stopName: `Stop ${didok}`,
  sloid: null,
  didok,
  lat: position?.lat ?? null,
  lon: position?.lon ?? null,
  via: 'backbone',
  junction: null,
  missingSince: null,
});

const S1 = line('test:S1');

const S1_STOPS = [
  stop(S1.id, 1, '8500001', at(7.005)),
  stop(S1.id, 2, '8500002', at(7.015)),
  stop(S1.id, 3, '8500003', at(7.035)),
  stop(S1.id, 4, '8500004', at(7.02, 47.015)),
  stop(S1.id, 5, '8500005', at(7.01, 47.01)),
  stop(S1.id, 6, '8500006', null),
];

const GEOMETRY = new Map([[S1.id, PARTS]]);

let rideCount = 0;

/** Coverage as `toCoverage` would return it; the sequences go unread here. */
const covered = (
  fromDidok: string | null = null,
  toDidok: string | null = null,
  lineOf: RailLine = S1,
): RailRideCoverage => {
  const ride: RailRide = {
    id: `ride-${(rideCount += 1)}`,
    lineId: lineOf.id,
    riddenOn: '2026-09-24',
    fromDidok,
    toDidok,
  };

  return { ride, line: lineOf, sequences: [] };
};

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
});

describe('sliceLine', () => {
  it('cuts a straight segment between the two stops', () => {
    expect(sliceLine(PARTS, at(7.005), at(7.015))).toEqual({
      ok: true,
      coordinates: [
        [
          [7.005, 47],
          [7.01, 47],
          [7.015, 47],
        ],
      ],
    });
  });

  it('cuts the same track when the segment runs the other way', () => {
    const forward = sliceLine(PARTS, at(7.005), at(7.035));
    const backward = sliceLine(PARTS, at(7.035), at(7.005));

    expect(forward.ok && backward.ok).toBe(true);
    if (!forward.ok || !backward.ok) return;

    expect(backward.coordinates).toEqual(reversed(forward.coordinates));
  });

  it('follows a part stored against the stops', () => {
    expect(sliceLine(PARTS, at(7.025), at(7.035))).toEqual({
      ok: true,
      coordinates: [
        [
          [7.025, 47],
          [7.03, 47],
          [7.035, 47],
        ],
      ],
    });
  });

  it('crosses a branch junction from the trunk onto the branch', () => {
    expect(sliceLine(PARTS, at(7.005), at(7.02, 47.015))).toEqual({
      ok: true,
      coordinates: [
        [
          [7.005, 47],
          [7.01, 47],
          [7.02, 47],
        ],
        [
          [7.02, 47],
          [7.02, 47.01],
          [7.02, 47.015],
        ],
      ],
    });
  });

  it('stays on the trunk through a junction rather than down the branch', () => {
    const slice = sliceLine(PARTS, at(7.005), at(7.035));

    expect(slice.ok && slice.coordinates.flat()).not.toContainEqual([
      7.02, 47.01,
    ]);
  });

  it('places a stop beside the track on the nearest point of it', () => {
    // About 110 m north of the line.
    expect(sliceLine(PARTS, at(7.005, 47.001), at(7.015))).toEqual({
      ok: true,
      coordinates: [
        [
          [7.005, 47],
          [7.01, 47],
          [7.015, 47],
        ],
      ],
    });
  });

  it('cuts within one segment when both stops land on it', () => {
    expect(sliceLine(PARTS, at(7.002), at(7.008))).toEqual({
      ok: true,
      coordinates: [
        [
          [7.002, 47],
          [7.008, 47],
        ],
      ],
    });
  });

  it('refuses a stop lying off the geometry', () => {
    // Over a kilometre south of the line.
    expect(sliceLine(PARTS, at(7.005), at(7.015, 46.99))).toEqual({
      ok: false,
      reason: expect.stringMatching(/^the to stop is \d+ m off the line$/),
    });
  });

  it('does not bridge a gap between parts', () => {
    const gapped = [WEST, [[7.03, 47] as Position, [7.04, 47] as Position]];

    expect(sliceLine(gapped, at(7.005), at(7.035))).toEqual({
      ok: false,
      reason: 'nothing connects the two stops on the line',
    });
  });

  it('refuses a line with no track to place a stop on', () => {
    expect(sliceLine([], at(7.005), at(7.015))).toEqual({
      ok: false,
      reason: 'the line has no geometry',
    });
  });
});

describe('rideStretches', () => {
  it('draws one feature per segment ride, keyed by line and ride', () => {
    const ride = covered('8500001', '8500002');

    expect(rideStretches([ride], S1_STOPS, GEOMETRY)).toEqual([
      {
        type: 'Feature',
        geometry: {
          type: 'MultiLineString',
          coordinates: [
            [
              [7.005, 47],
              [7.01, 47],
              [7.015, 47],
            ],
          ],
        },
        properties: { id: S1.id, rideId: ride.ride.id },
      },
    ]);
  });

  it('crosses a branch junction for a ride onto the branch', () => {
    const [stretch] = rideStretches(
      [covered('8500001', '8500004')],
      S1_STOPS,
      GEOMETRY,
    );

    expect(stretch?.geometry.coordinates).toHaveLength(2);
  });

  it('leaves a whole-line ride to the line’s own feature', () => {
    expect(rideStretches([covered()], S1_STOPS, GEOMETRY)).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('skips a ride with a stop lying off the geometry, with a warning', () => {
    const ride = covered('8500001', '8500005');

    expect(rideStretches([ride], S1_STOPS, GEOMETRY)).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(
        new RegExp(
          `^\\[stats/rail\\] skipping the stretch of ride ${ride.ride.id} .*8500005: the to stop is \\d+ m off the line$`,
        ),
      ),
    );
  });

  it('skips a ride with a stop that has no position, with a warning', () => {
    expect(
      rideStretches([covered('8500001', '8500006')], S1_STOPS, GEOMETRY),
    ).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('8500006 has no position'),
    );
  });

  it('skips a ride on a line with no geometry, with a warning', () => {
    expect(
      rideStretches([covered('8500001', '8500002')], S1_STOPS, new Map()),
    ).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(`${S1.id} has no geometry`),
    );
  });

  it('keeps the other rides when one is skipped', () => {
    const kept = covered('8500002', '8500003');
    const stretches = rideStretches(
      [covered('8500001', '8500005'), kept],
      S1_STOPS,
      GEOMETRY,
    );

    expect(stretches.map(({ properties }) => properties.rideId)).toEqual([
      kept.ride.id,
    ]);
  });
});

describe('wholeLineIds', () => {
  it('names each line ridden end to end once', () => {
    const IR1 = line('test:IR1');

    expect(
      wholeLineIds([
        covered(),
        covered(),
        covered('8500001', '8500002'),
        covered('8500001', '8500002', IR1),
      ]),
    ).toEqual([S1.id]);
  });
});
