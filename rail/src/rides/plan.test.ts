import { describe, expect, it } from 'vitest';

import type { Destination } from './commute.ts';
import { planRides } from './plan.ts';

function days(destination: Destination, dates: string[]) {
  return dates.map(date => ({ date, destination }));
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Enough pre-move Zug days for the pool that holds a fixed 30 S24 legs. */
function zugDays(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    date: `2024-${pad(Math.floor(index / 28) + 1)}-${pad((index % 28) + 1)}`,
    destination: 'zug' as const,
  }));
}

describe('planRides', () => {
  it('rides a post-move Zug day out and back on one line', () => {
    const { rides } = planRides(days('zug', ['2026-09-24']));

    expect(rides).toEqual([
      {
        lineId: 'fernverkehr:IR70',
        riddenOn: '2026-09-24',
        fromDidok: '8505000',
        toDidok: '8502204',
      },
      {
        lineId: 'fernverkehr:IR70',
        riddenOn: '2026-09-24',
        fromDidok: '8502204',
        toDidok: '8505000',
      },
    ]);
  });

  it('rides a pre-move Zug day over three legs each way', () => {
    const { rides } = planRides(zugDays(60));
    const first = rides.filter(ride => ride.riddenOn === '2024-01-01');

    expect(first.map(ride => [ride.fromDidok, ride.toDidok])).toEqual([
      ['8508055', '8507000'],
      ['8507000', '8503000'],
      ['8503000', '8502204'],
      ['8502204', '8503000'],
      ['8503000', '8507000'],
      ['8507000', '8508055'],
    ]);
  });

  it('sends ten of two hundred pre-move Zug days home through Luzern', () => {
    const { rides } = planRides(zugDays(200));
    const viaLuzern = rides.filter(
      ride => ride.fromDidok === '8502204' && ride.toDidok === '8505000',
    );

    expect(viaLuzern).toHaveLength(10);
    // Scattered through the run, not bunched at one end of it.
    expect(new Set(viaLuzern.map(ride => ride.riddenOn.slice(0, 7))).size).toBeGreaterThan(1);
  });

  it('takes the post-move Wildegg day out over Olten and home over Zofingen', () => {
    const { rides } = planRides(days('wildegg', ['2026-07-15']));

    expect(rides.map(ride => [ride.lineId, ride.fromDidok, ride.toDidok])).toEqual([
      ['fernverkehr:IC21', '8505000', '8500218'],
      ['s-bahn-aargau:S29', '8500218', '8502115'],
      ['s-bahn-aargau:S29', '8502115', '8502001'],
      ['fernverkehr:IR15', '8502001', '8505000'],
    ]);
  });

  it('counts the rows per line', () => {
    const { byLine } = planRides(days('luzern', ['2024-03-04']));

    expect(Object.fromEntries(byLine)).toEqual({
      's-bahn-bern:S9': 2,
      'fernverkehr:IR15': 2,
    });
  });

  it('sorts by date, so the spread does not depend on the export order', () => {
    const forwards = planRides(days('zug', ['2026-07-01', '2026-07-02']));
    const backwards = planRides(days('zug', ['2026-07-02', '2026-07-01']));

    expect(forwards.rides).toEqual(backwards.rides);
  });

  it('refuses a day whose era and destination have no route', () => {
    // Luzern became home at the move; a Luzern office day after it is a mistake.
    expect(() => planRides(days('luzern', ['2026-09-24']))).toThrow(/post:luzern/);
  });
});
