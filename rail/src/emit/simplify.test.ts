import { describe, expect, it } from 'vitest';

import { simplifyPart, simplifyParts } from './simplify.ts';

/** About 11 m of latitude, and about 7.6 m of longitude at 47° north. */
const STEP = 0.0001;

describe('simplifyPart', () => {
  it('keeps a part of two points as it is', () => {
    expect(
      simplifyPart(
        [
          [8.1, 47.1],
          [8.2, 47.2],
        ],
        30,
      ),
    ).toEqual([
      [8.1, 47.1],
      [8.2, 47.2],
    ]);
  });

  it('reduces a straight line to its two ends', () => {
    expect(
      simplifyPart(
        [
          [8.1, 47.1],
          [8.15, 47.1],
          [8.2, 47.1],
          [8.25, 47.1],
        ],
        30,
      ),
    ).toEqual([
      [8.1, 47.1],
      [8.25, 47.1],
    ]);
  });

  it('keeps a bend farther from the chord than the tolerance', () => {
    expect(
      simplifyPart(
        [
          [8.1, 47.1],
          [8.15, 47.1 + 5 * STEP],
          [8.2, 47.1],
        ],
        30,
      ),
    ).toEqual([
      [8.1, 47.1],
      [8.15, 47.1 + 5 * STEP],
      [8.2, 47.1],
    ]);
  });

  it('drops a bend closer to the chord than the tolerance', () => {
    expect(
      simplifyPart(
        [
          [8.1, 47.1],
          [8.15, 47.1 + 2 * STEP],
          [8.2, 47.1],
        ],
        30,
      ),
    ).toEqual([
      [8.1, 47.1],
      [8.2, 47.1],
    ]);
  });

  it('measures in metres, so a degree of longitude counts for less than one of latitude', () => {
    const northward = simplifyPart(
      [
        [8.1, 47.1],
        [8.1 + 3 * STEP, 47.15],
        [8.1, 47.2],
      ],
      30,
    );
    const eastward = simplifyPart(
      [
        [8.1, 47.1],
        [8.15, 47.1 + 3 * STEP],
        [8.2, 47.1],
      ],
      30,
    );

    expect(northward).toHaveLength(2);
    expect(eastward).toHaveLength(3);
  });

  it('keeps the far side of a loop that starts and ends at one point', () => {
    expect(
      simplifyPart(
        [
          [8.1, 47.1],
          [8.1005, 47.1],
          [8.101, 47.1],
          [8.1005, 47.1],
          [8.1, 47.1],
        ],
        30,
      ),
    ).toEqual([
      [8.1, 47.1],
      [8.101, 47.1],
      [8.1, 47.1],
    ]);
  });

  it('keeps every point that bends by more than the tolerance, and only those', () => {
    expect(
      simplifyPart(
        [
          [8.1, 47.1],
          [8.11, 47.1 + 4 * STEP],
          [8.12, 47.1 + 10 * STEP],
          [8.13, 47.1 + STEP],
          [8.14, 47.1 - 10 * STEP],
          [8.15, 47.1],
        ],
        30,
      ),
    ).toEqual([
      [8.1, 47.1],
      [8.12, 47.1 + 10 * STEP],
      [8.14, 47.1 - 10 * STEP],
      [8.15, 47.1],
    ]);
  });
});

describe('simplifyParts', () => {
  it('simplifies every part on its own, keeping each one’s ends', () => {
    expect(
      simplifyParts(
        [
          [
            [8.1, 47.1],
            [8.15, 47.1],
            [8.2, 47.1],
          ],
          [
            [8.2, 47.1],
            [8.2, 47.15],
            [8.2, 47.2],
          ],
        ],
        30,
      ),
    ).toEqual([
      [
        [8.1, 47.1],
        [8.2, 47.1],
      ],
      [
        [8.2, 47.1],
        [8.2, 47.2],
      ],
    ]);
  });
});
