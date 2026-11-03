import type { Position } from 'geojson';
import { describe, expect, it } from 'vitest';

import {
  clipToBox,
  CROSSINGS,
  crossingTo,
  swissStop,
} from '@/lib/stats/rail/abroad';

const BOX = { west: 0, south: 0, east: 10, north: 10 };

describe('clipToBox', () => {
  it('keeps a run inside the box as it is', () => {
    const run: Position[] = [
      [1, 1],
      [2, 2],
      [3, 1],
    ];

    expect(clipToBox([run], BOX)).toEqual([run]);
  });

  it('cuts a run where it leaves the box', () => {
    expect(
      clipToBox(
        [
          [
            [5, 5],
            [5, 15],
          ],
        ],
        BOX,
      ),
    ).toEqual([
      [
        [5, 5],
        [5, 10],
      ],
    ]);
  });

  it('splits a run that leaves the box and comes back', () => {
    expect(
      clipToBox(
        [
          [
            [5, 8],
            [5, 12],
            [6, 12],
            [6, 8],
          ],
        ],
        BOX,
      ),
    ).toEqual([
      [
        [5, 8],
        [5, 10],
      ],
      [
        [6, 10],
        [6, 8],
      ],
    ]);
  });

  it('drops a run wholly outside the box', () => {
    expect(
      clipToBox(
        [
          [
            [20, 20],
            [30, 30],
          ],
        ],
        BOX,
      ),
    ).toEqual([]);
  });
});

describe('crossings', () => {
  it('reads a station abroad as the border it was reached from', () => {
    expect(swissStop('fernverkehr:EC6', '8301700')).toBe('8501609');
    expect(crossingTo('fernverkehr:EC6', '8301700')?.station.name).toBe(
      'Milano Centrale',
    );
  });

  it('leaves a Swiss stop, and a station on another line, as they are', () => {
    expect(swissStop('fernverkehr:EC6', '8507000')).toBe('8507000');
    expect(swissStop('fernverkehr:IC1', '8301700')).toBe('8301700');
  });

  it('has every station abroad outside Switzerland and a UIC number', () => {
    for (const { station, border } of CROSSINGS) {
      expect(station.uic).toMatch(/^[0-9]{7}$/);
      expect(border).toMatch(/^85[0-9]{5}$/);
      expect(station.uic.startsWith('85')).toBe(false);
    }
  });
});
