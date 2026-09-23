import { describe, expect, it } from 'vitest';

import { referenceWeek } from './week.ts';

/** Each real timetable year: second Sunday of December to the Saturday before the next. */
const FP2025 = { first: '2024-12-15', last: '2025-12-13' };
const FP2026 = { first: '2025-12-14', last: '2026-12-12' };
const FP2027 = { first: '2026-12-13', last: '2027-12-11' };

describe('referenceWeek', () => {
  it('is the first full Monday-to-Sunday week of September in the year the feed ends', () => {
    expect(referenceWeek(FP2026)).toEqual({ first: '2026-09-07', last: '2026-09-13' });
    expect(referenceWeek(FP2027)).toEqual({ first: '2027-09-06', last: '2027-09-12' });
  });

  it('starts on the 1st when the 1st is a Monday', () => {
    expect(referenceWeek(FP2025)).toEqual({ first: '2025-09-01', last: '2025-09-07' });
  });

  it('skips a September that opens on a Sunday rather than counting a one-day week', () => {
    expect(referenceWeek({ first: '2023-12-10', last: '2024-12-14' })).toEqual({
      first: '2024-09-02',
      last: '2024-09-08',
    });
  });

  it('refuses a feed that does not cover the week', () => {
    expect(() => referenceWeek({ first: '2026-09-10', last: '2026-12-12' })).toThrow(
      /2026-09-07 to 2026-09-13 is not inside the feed's 2026-09-10 to 2026-12-12/,
    );
  });
});
