import { describe, expect, it, vi } from 'vitest';

import { toLogTable, WHOLE_LINE, type RailLogTable } from '@/lib/stats/rail/log';
import type { RailLine, RailRideLogEntry } from '@/lib/stats/rail/types';

const line = (
  displayName: string,
  terminalA = 'A',
  terminalB = 'B',
  id = `test:${displayName}`,
): RailLine => ({
  id,
  displayName,
  category: 'S',
  networkRegion: 'test',
  operators: ['SBB'],
  terminalA,
  terminalB,
  trueTerminalA: terminalA,
  trueTerminalB: terminalB,
  seasonal: false,
  tripsPerWeek: 100,
  hasGeometry: true,
  missingSince: null,
});

let rides = 0;

const entry = (
  riddenOn: string,
  onLine: RailLine,
  from: string | null = null,
  to: string | null = null,
): RailRideLogEntry => ({
  ride: {
    id: `ride-${++rides}`,
    lineId: onLine.id,
    riddenOn,
    fromDidok: from && '8500001',
    toDidok: to && '8500002',
  },
  line: onLine,
  from,
  to,
});

const S9 = line('S9', 'Bern', 'Unterzollikofen');
const IC1 = line('IC1', 'Genève-Aéroport', 'St. Gallen');

const asIs = (day: string) => day;

describe('toLogTable', () => {
  it('lists each day once, oldest first, formatted once', () => {
    const formatDay = vi.fn((day: string) => `day ${day}`);
    const table = toLogTable(
      [
        entry('2026-01-05', S9),
        entry('2026-01-05', IC1),
        entry('2025-12-31', S9),
      ],
      formatDay,
    );

    expect(table.days).toEqual(['day 2025-12-31', 'day 2026-01-05']);
    expect(formatDay).toHaveBeenCalledTimes(2);
  });

  it('names a line by its code and its terminals', () => {
    const { lines } = toLogTable([entry('2026-01-05', S9)], asIs);

    expect(lines).toEqual([['S9', 'Bern – Unterzollikofen']]);
  });

  it('orders the numbers in a code as numbers', () => {
    const codes = ['S24', 'IC21', 'S9', 'IC6', 'IC1'];
    const { lines } = toLogTable(
      codes.map(code => entry('2026-01-05', line(code))),
      asIs,
    );

    expect(lines.map(([code]) => code)).toEqual([
      'IC1',
      'IC6',
      'IC21',
      'S9',
      'S24',
    ]);
  });

  it('orders lines that share a code by their terminals', () => {
    const { lines } = toLogTable(
      [
        entry('2026-01-05', line('S1', 'Zug', 'Baar', 'test:S1-zug')),
        entry('2026-01-05', line('S1', 'Basel', 'Olten', 'test:S1-basel')),
      ],
      asIs,
    );

    expect(lines).toEqual([
      ['S1', 'Basel – Olten'],
      ['S1', 'Zug – Baar'],
    ]);
  });

  it('folds two lines that print the same into one', () => {
    const table = toLogTable(
      [
        entry('2026-01-05', line('IC8', 'Brig', 'Romanshorn', 'test:a')),
        entry('2026-01-05', line('IC8', 'Brig', 'Romanshorn', 'test:b')),
      ],
      asIs,
    );

    expect(table.lines).toEqual([['IC8', 'Brig – Romanshorn']]);
    expect(table.rides.map(([, lineIndex]) => lineIndex)).toEqual([0, 0]);
  });

  it('names a stretch in the direction it ran', () => {
    const { stretches } = toLogTable(
      [
        entry('2026-01-05', S9, 'Bern', 'Unterzollikofen'),
        entry('2026-01-05', S9, 'Unterzollikofen', 'Bern'),
      ],
      asIs,
    );

    expect(stretches).toEqual(['Bern → Unterzollikofen', 'Unterzollikofen → Bern']);
  });

  it('calls a ride with no stops the whole line, filed under W', () => {
    const { stretches } = toLogTable(
      [
        entry('2026-01-05', S9),
        entry('2026-01-05', S9, 'Zug', 'Baar'),
        entry('2026-01-05', S9, 'Bern', 'Zug'),
      ],
      asIs,
    );

    expect(stretches).toEqual(['Bern → Zug', WHOLE_LINE, 'Zug → Baar']);
  });

  it('sorts an accented stop with its letter', () => {
    const { stretches } = toLogTable(
      [
        entry('2026-01-05', S9, 'Zug', 'Baar'),
        entry('2026-01-05', S9, 'Écublens', 'Baar'),
        entry('2026-01-05', S9, 'Bern', 'Baar'),
      ],
      asIs,
    );

    expect(stretches).toEqual(['Bern → Baar', 'Écublens → Baar', 'Zug → Baar']);
  });

  it('packs every ride, in log order, as the indices of what it prints', () => {
    const log = [
      entry('2026-01-06', S9, 'Bern', 'Unterzollikofen'),
      entry('2026-01-05', IC1),
      entry('2026-01-05', S9, 'Unterzollikofen', 'Bern'),
    ];
    const table = toLogTable(log, asIs);

    expect(
      table.rides.map(([day, lineIndex, stretch]) => [
        table.days[day],
        table.lines[lineIndex][0],
        table.stretches[stretch],
      ]),
    ).toEqual([
      ['2026-01-06', 'S9', 'Bern → Unterzollikofen'],
      ['2026-01-05', 'IC1', WHOLE_LINE],
      ['2026-01-05', 'S9', 'Unterzollikofen → Bern'],
    ]);
  });

  it('builds the same lists whatever order the log is in', () => {
    const log = [
      entry('2026-01-06', S9, 'Bern', 'Unterzollikofen'),
      entry('2026-01-05', IC1),
      entry('2025-12-31', S9, 'Unterzollikofen', 'Bern'),
    ];
    const listsOf = ({ days, lines, stretches }: RailLogTable) => ({
      days,
      lines,
      stretches,
    });

    expect(listsOf(toLogTable([...log].reverse(), asIs))).toEqual(
      listsOf(toLogTable(log, asIs)),
    );
  });

  it('packs an empty log as empty lists', () => {
    expect(toLogTable([], asIs)).toEqual({
      days: [],
      lines: [],
      stretches: [],
      rides: [],
    });
  });
});
