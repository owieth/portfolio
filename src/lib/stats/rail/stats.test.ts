import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  categoryProgress,
  lineProgress,
  railTotals,
  stationsVisited,
  toCoverage,
} from '@/lib/stats/rail/stats';
import type {
  RailLine,
  RailRide,
  RailStop,
  RailStopVia,
} from '@/lib/stats/rail/types';

const line = (id: string, category: string): RailLine => ({
  id,
  displayName: id,
  category,
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
  didok: string | null,
  via: RailStopVia = 'backbone',
  junction: string | null = null,
): RailStop => ({
  lineId,
  sequence,
  stopName: `Stop ${didok ?? sequence}`,
  sloid: null,
  didok,
  lat: null,
  lon: null,
  via,
  junction,
  missingSince: null,
});

const S1 = line('test:S1', 'S');
const IR1 = line('test:IR1', 'IR');
const FUN1 = line('test:FUN1', 'FUN');
const LINES = [S1, IR1, FUN1];

/**
 * The trunk runs 1 to 6, with a detour at 3 and an extension at 6. After it:
 * a block off 2 (7, 8), a block off that block (9), and a block that shares
 * no stop with the line (10, 11).
 */
const S1_STOPS = [
  stop(S1.id, 1, '8500001'),
  stop(S1.id, 2, '8500002'),
  stop(S1.id, 3, '8500003', 'detour', '8500002'),
  stop(S1.id, 4, '8500004'),
  stop(S1.id, 5, '8500005'),
  stop(S1.id, 6, '8500006', 'extension', '8500005'),
  stop(S1.id, 7, '8500007', 'branch', '8500002'),
  stop(S1.id, 8, '8500008', 'branch', '8500002'),
  stop(S1.id, 9, '8500009', 'branch', '8500007'),
  stop(S1.id, 10, '8500010', 'branch'),
  stop(S1.id, 11, '8500011', 'branch'),
];

/** Shares 8500004 with the S1, and has one stop with no Didok number. */
const IR1_STOPS = [
  stop(IR1.id, 1, '8500004'),
  stop(IR1.id, 2, '8500020'),
  stop(IR1.id, 3, null),
];

const STOPS = [...S1_STOPS, ...IR1_STOPS];

let rideCount = 0;

const ride = (
  lineId: string,
  fromDidok: string | null = null,
  toDidok: string | null = null,
): RailRide => ({
  id: `ride-${(rideCount += 1)}`,
  lineId,
  riddenOn: '2026-09-24',
  fromDidok,
  toDidok,
});

const sequencesOf = (rides: RailRide[]) =>
  toCoverage(LINES, STOPS, rides).map(({ sequences }) => sequences);

const progressOf = (rides: RailRide[]) =>
  lineProgress(LINES, STOPS, toCoverage(LINES, STOPS, rides));

const progressFor = (rides: RailRide[], lineId: string) =>
  progressOf(rides).find(({ line: { id } }) => id === lineId);

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
});

describe('toCoverage', () => {
  it('covers every stop of a whole-line ride, branches and all', () => {
    expect(sequencesOf([ride(S1.id)])).toEqual([
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    ]);
  });

  it('covers the stops between the two ends of a segment', () => {
    expect(sequencesOf([ride(S1.id, '8500001', '8500004')])).toEqual([
      [1, 2, 3, 4],
    ]);
  });

  it('covers the same stops when the segment runs the other way', () => {
    expect(sequencesOf([ride(S1.id, '8500004', '8500001')])).toEqual([
      [1, 2, 3, 4],
    ]);
  });

  it('covers an extension past the end of the trunk', () => {
    expect(sequencesOf([ride(S1.id, '8500004', '8500006')])).toEqual([
      [4, 5, 6],
    ]);
  });

  it('leaves the trunk at the junction onto a branch', () => {
    expect(sequencesOf([ride(S1.id, '8500001', '8500008')])).toEqual([
      [1, 2, 7, 8],
    ]);
  });

  it('walks back through the junction rather than on down the sequence', () => {
    expect(sequencesOf([ride(S1.id, '8500008', '8500005')])).toEqual([
      [2, 3, 4, 5, 7, 8],
    ]);
  });

  it('follows a branch that leaves from another branch', () => {
    expect(sequencesOf([ride(S1.id, '8500009', '8500004')])).toEqual([
      [2, 3, 4, 7, 9],
    ]);
  });

  it('covers one stop when a segment starts and ends at it', () => {
    expect(sequencesOf([ride(S1.id, '8500004', '8500004')])).toEqual([[4]]);
  });

  it('walks within a block that shares no stop with its line', () => {
    expect(sequencesOf([ride(S1.id, '8500010', '8500011')])).toEqual([
      [10, 11],
    ]);
  });

  it('skips a ride on an unknown line, with a warning', () => {
    const unknown = ride('test:S99');

    expect(sequencesOf([unknown, ride(S1.id, '8500001', '8500002')])).toEqual(
      [[1, 2]],
    );
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(
      `[stats/rail] skipping ride ${unknown.id} on 2026-09-24: test:S99 is not a known line`,
    );
  });

  it('skips a ride from a stop that is not on its line, with a warning', () => {
    const offLine = ride(S1.id, '8500001', '8500020');

    expect(sequencesOf([offLine])).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      `[stats/rail] skipping ride ${offLine.id} on 2026-09-24: 8500020 is not on test:S1`,
    );
  });

  it('names both stops when neither is on the line', () => {
    const offLine = ride(S1.id, '8500098', '8500099');

    expect(sequencesOf([offLine])).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      `[stats/rail] skipping ride ${offLine.id} on 2026-09-24: 8500098, 8500099 is not on test:S1`,
    );
  });

  it('skips a ride between stops nothing connects, with a warning', () => {
    const disconnected = ride(S1.id, '8500001', '8500010');

    expect(sequencesOf([disconnected])).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      `[stats/rail] skipping ride ${disconnected.id} on 2026-09-24: nothing connects 8500001 and 8500010 on test:S1`,
    );
  });

  it('does not depend on the order the stops came in', () => {
    const rides = [ride(S1.id, '8500009', '8500004')];

    expect(
      toCoverage(LINES, [...STOPS].reverse(), rides).map(
        ({ sequences }) => sequences,
      ),
    ).toEqual(sequencesOf(rides));
  });
});

describe('lineProgress', () => {
  it('counts a stop two rides share once', () => {
    const progress = progressFor(
      [ride(S1.id, '8500001', '8500004'), ride(S1.id, '8500002', '8500005')],
      S1.id,
    );

    expect(progress).toMatchObject({
      stops: 11,
      covered: 5,
      share: 5 / 11,
      touched: true,
      complete: false,
    });
  });

  it('completes a line ridden end to end', () => {
    expect(progressFor([ride(S1.id)], S1.id)).toMatchObject({
      covered: 11,
      share: 1,
      touched: true,
      complete: true,
    });
  });

  it('completes a line its segments cover between them', () => {
    expect(
      progressFor(
        [
          ride(S1.id, '8500009', '8500006'),
          ride(S1.id, '8500001', '8500008'),
          ride(S1.id, '8500010', '8500011'),
        ],
        S1.id,
      ),
    ).toMatchObject({ covered: 11, complete: true });
  });

  it('lists a line nobody rode as untouched', () => {
    expect(progressFor([], IR1.id)).toEqual({
      line: IR1,
      stops: 3,
      covered: 0,
      share: 0,
      touched: false,
      complete: false,
    });
  });

  it('counts a stop with no Didok number towards the share', () => {
    expect(progressFor([ride(IR1.id)], IR1.id)).toMatchObject({
      covered: 3,
      complete: true,
    });
  });

  it('never completes a line with no stops', () => {
    expect(progressFor([ride(FUN1.id)], FUN1.id)).toMatchObject({
      stops: 0,
      covered: 0,
      share: 0,
      touched: true,
      complete: false,
    });
  });

  it('leaves out what a skipped ride would have covered', () => {
    expect(progressFor([ride(S1.id, '8500001', '8500020')], S1.id)).toMatchObject(
      { covered: 0, touched: false },
    );
  });

  it('keeps the order the lines came in', () => {
    expect(progressOf([]).map(({ line: { id } }) => id)).toEqual([
      S1.id,
      IR1.id,
      FUN1.id,
    ]);
  });
});

describe('stationsVisited', () => {
  it('counts a station on two lines once', () => {
    const coverage = toCoverage(LINES, STOPS, [
      ride(S1.id, '8500001', '8500004'),
      ride(IR1.id, '8500004', '8500020'),
    ]);

    expect(stationsVisited(STOPS, coverage).map(({ didok }) => didok)).toEqual(
      ['8500001', '8500002', '8500003', '8500004', '8500020'],
    );
  });

  it('leaves out a stop with no Didok number', () => {
    const coverage = toCoverage(LINES, STOPS, [ride(IR1.id)]);

    expect(stationsVisited(STOPS, coverage)).toEqual([
      { didok: '8500004', stopName: 'Stop 8500004', lat: null, lon: null },
      { didok: '8500020', stopName: 'Stop 8500020', lat: null, lon: null },
    ]);
  });
});

describe('categoryProgress and railTotals', () => {
  const rides = [
    ride(S1.id, '8500001', '8500004'),
    ride(S1.id, '8500002', '8500005'),
    ride(IR1.id),
    ride(FUN1.id),
    ride('test:S99'),
  ];
  const coverage = () => toCoverage(LINES, STOPS, rides);
  const progress = () => lineProgress(LINES, STOPS, coverage());

  it('sums each category from its lines', () => {
    expect(categoryProgress(progress())).toEqual([
      { category: 'FUN', lines: 1, touched: 1, complete: 0, stops: 0, covered: 0 },
      { category: 'IR', lines: 1, touched: 1, complete: 1, stops: 3, covered: 3 },
      { category: 'S', lines: 1, touched: 1, complete: 0, stops: 11, covered: 5 },
    ]);
  });

  it('orders categories by lines, then by name', () => {
    const lines = [...LINES, line('test:IR2', 'IR')];

    expect(
      categoryProgress(lineProgress(lines, STOPS, [])).map(
        ({ category }) => category,
      ),
    ).toEqual(['IR', 'FUN', 'S']);
  });

  it('totals the sum of the per-line results', () => {
    const lines = progress();
    const totals = railTotals(lines, stationsVisited(STOPS, coverage()));

    expect(totals).toEqual({ lines: 3, touched: 3, complete: 1, stations: 6 });
    expect(totals.touched).toBe(lines.filter((l) => l.touched).length);
    expect(totals.complete).toBe(lines.filter((l) => l.complete).length);
  });

  it('totals the sum of the categories', () => {
    const lines = progress();
    const totals = railTotals(lines, stationsVisited(STOPS, coverage()));
    const categories = categoryProgress(lines);
    const sum = (key: 'lines' | 'touched' | 'complete') =>
      categories.reduce((total, category) => total + category[key], 0);

    expect({
      lines: sum('lines'),
      touched: sum('touched'),
      complete: sum('complete'),
    }).toEqual({
      lines: totals.lines,
      touched: totals.touched,
      complete: totals.complete,
    });
  });
});
