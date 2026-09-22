import { describe, expect, it } from 'vitest';

import type { FlagValue } from './options.ts';
import {
  parseFetchOptions,
  secondSundayOfDecember,
  timetableYearOn,
} from './options.ts';

describe('secondSundayOfDecember', () => {
  // Checked against the publisher's own dct:temporal, which is the only reason
  // to trust the rule at all: the 2026 series runs 2025-12-14 to 2026-12-12 and
  // the 2027 series starts 2026-12-13.
  const CASES: [number, string][] = [
    [2025, '2025-12-14'],
    [2026, '2026-12-13'],
    [2027, '2027-12-12'],
  ];

  it.each(CASES)('resolves %i to %s', (year, expected) => {
    const date = secondSundayOfDecember(year);
    expect(date.getDay(), 'the switch is always a Sunday').toBe(0);
    expect(
      `${date.getFullYear()}-12-${String(date.getDate()).padStart(2, '0')}`,
    ).toBe(expected);
  });
});

describe('timetableYearOn', () => {
  const CASES: [string, number][] = [
    // Mid-season, the ordinary case.
    ['2026-09-22', 2026],
    // The day before the switch still belongs to the outgoing timetable.
    ['2026-12-12', 2026],
    // The switch itself, which is the whole reason this is computed.
    ['2026-12-13', 2027],
    // January is already inside the year that started the previous December.
    ['2027-01-05', 2027],
  ];

  it.each(CASES)('on %s the timetable year is %i', (day, expected) => {
    const [year, month, date] = day.split('-').map(Number);
    expect(timetableYearOn(new Date(year, month - 1, date))).toBe(expected);
  });
});

describe('parseFetchOptions', () => {
  const NOW = new Date(2026, 8, 22);

  it('defaults to the official source and the current timetable year', () => {
    expect(parseFetchOptions({}, NOW)).toEqual({
      ok: true,
      value: {
        source: 'opentransportdata',
        year: 2026,
        dataset: 'timetable-2026-gtfs2020',
      },
    });
  });

  it('builds the dataset name from the year rather than a lookup table', () => {
    expect(parseFetchOptions({ year: '2027' }, NOW)).toEqual({
      ok: true,
      value: {
        source: 'opentransportdata',
        year: 2027,
        dataset: 'timetable-2027-gtfs2020',
      },
    });
  });

  it('carries no year for the mirror, which has no year selector', () => {
    expect(parseFetchOptions({ source: 'geops' }, NOW)).toEqual({
      ok: true,
      value: { source: 'geops', year: null, dataset: null },
    });
  });

  const REJECTED: [string, Record<string, FlagValue>][] = [
    // parseArgs hands back a boolean for a flag written without a value.
    ['--year with no value', { year: true }],
    // And an array if the flag is ever declared as repeatable.
    ['--year given twice', { year: ['2026', '2027'] }],
    ['--year that is not a year', { year: 'twenty' }],
    // 2025 and earlier exist only as HRDF, which this pipeline does not read.
    ['--year before the first published one', { year: '2025' }],
    ['--year too far ahead', { year: '2030' }],
    ['an unknown source', { source: 'sbb' }],
    // Accepting this would imply the mirror has a selector it does not have.
    ['--year against the mirror', { source: 'geops', year: '2026' }],
  ];

  it.each(REJECTED)('rejects %s', (_label, values) => {
    const result = parseFetchOptions(values, NOW);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.length).toBeGreaterThan(0);
  });
});
