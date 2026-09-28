import { describe, expect, it } from 'vitest';

import { toLogTable, type RailLogTable } from '@/lib/stats/rail/log';
import { logRows } from '@/lib/stats/rail/log-rows';
import type { RailLine, RailRideLogEntry } from '@/lib/stats/rail/types';

const TABLE: RailLogTable = {
  days: ['31 Dec 2025', '05 Jan 2026'],
  lines: [
    ['IC1', 'Genève-Aéroport – St. Gallen'],
    ['S9', 'Bern – Unterzollikofen'],
  ],
  stretches: ['Bern → Unterzollikofen', 'Whole line'],
  rides: [
    [1, 1, 0],
    [1, 0, 1],
    [0, 1, 0],
  ],
};

describe('logRows', () => {
  it('spells each ride out the way the log prints it', () => {
    expect(logRows(TABLE)[1]).toMatchObject({
      day: '05 Jan 2026',
      code: 'IC1',
      terminals: 'Genève-Aéroport – St. Gallen',
      stretch: 'Whole line',
    });
  });

  it('ranks each column by the index the ride was packed with', () => {
    expect(logRows(TABLE)[0]).toMatchObject({
      dayRank: 1,
      lineRank: 1,
      stretchRank: 0,
    });
  });

  it('keeps the order the rides were packed in', () => {
    expect(logRows(TABLE).map(({ day, code }) => `${day} ${code}`)).toEqual([
      '05 Jan 2026 S9',
      '05 Jan 2026 IC1',
      '31 Dec 2025 S9',
    ]);
  });

  it('gives back what the log printed before it was packed', () => {
    const line = (displayName: string, terminalA: string, terminalB: string) =>
      ({ id: `test:${displayName}`, displayName, terminalA, terminalB }) as RailLine;
    const entry = (
      riddenOn: string,
      onLine: RailLine,
      from: string | null,
      to: string | null,
    ) =>
      ({
        ride: { id: riddenOn, lineId: onLine.id, riddenOn },
        line: onLine,
        from,
        to,
      }) as RailRideLogEntry;
    const S9 = line('S9', 'Bern', 'Unterzollikofen');
    const IC1 = line('IC1', 'Genève-Aéroport', 'St. Gallen');
    const log = [
      entry('2026-01-06', S9, 'Unterzollikofen', 'Bern'),
      entry('2026-01-05', IC1, null, null),
      entry('2025-12-31', S9, 'Bern', 'Unterzollikofen'),
    ];
    const formatDay = (day: string) => `on ${day}`;

    expect(
      logRows(toLogTable(log, formatDay)).map(
        ({ day, code, terminals, stretch }) => [day, code, terminals, stretch],
      ),
    ).toEqual(
      log.map(({ ride, line, from, to }) => [
        formatDay(ride.riddenOn),
        line.displayName,
        `${line.terminalA} – ${line.terminalB}`,
        from && to ? `${from} → ${to}` : 'Whole line',
      ]),
    );
  });

  it('unpacks no rides into no rows', () => {
    expect(logRows({ ...TABLE, rides: [] })).toEqual([]);
  });
});
