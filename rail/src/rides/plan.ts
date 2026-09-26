/**
 * Office days as ride rows.
 *
 * One row per leg per direction: a day at the Zug office before the move is six
 * rows, three out and three back, because that is six stretches of track
 * ridden. Direction is not recorded — `rail_rides` treats either stop order as
 * the same stretch — but both directions are, so the counts are a commute and
 * not half of one.
 *
 * The line on each leg is dealt by `commute.ts` from a pool, which is why this
 * runs in two passes: collect every leg in date order first, then fill in the
 * lines pool by pool. Doing it a day at a time would have to decide a ratio
 * from one leg, which no rounding can do.
 */

import type { Destination } from './commute.ts';
import {
  MOVED_ON,
  POOLS,
  RETURNS_VIA_LUZERN,
  ROUTES,
  ZUG_BACK_VIA_LUZERN,
  allocate,
  spread,
} from './commute.ts';
import type { Leg, RouteKey } from './commute.ts';

export interface OfficeDay {
  date: string;
  destination: Destination;
}

/** A row of `public.rail_rides`, less the id and the timestamp it defaults. */
export interface Ride {
  lineId: string;
  riddenOn: string;
  fromDidok: string;
  toDidok: string;
}

interface Slot {
  date: string;
  leg: Leg;
}

function routeKey(day: OfficeDay): RouteKey {
  const era = day.date < MOVED_ON ? 'pre' : 'post';
  const key = `${era}:${day.destination}`;

  if (!(key in ROUTES)) {
    throw new Error(`no route for ${key} — ${day.date} went somewhere unrouted`);
  }

  return key as RouteKey;
}

/**
 * Which pre-move Zug days came home through Luzern. Chosen by the same spread
 * that deals lines, over the days in date order, so the ten are scattered
 * through the four years rather than bunched.
 */
function returnsViaLuzern(days: OfficeDay[]): Set<string> {
  const zug = days.filter(day => routeKey(day) === 'pre:zug');
  const dealt = spread(
    [
      { key: 'luzern', count: RETURNS_VIA_LUZERN },
      { key: 'zurich', count: zug.length - RETURNS_VIA_LUZERN },
    ],
    zug.length,
  );

  return new Set(zug.filter((_, index) => dealt[index] === 'luzern').map(day => day.date));
}

export interface Planned {
  rides: Ride[];
  /** Rows per line id, for the run's summary and the generated SQL's header. */
  byLine: Map<string, number>;
}

export function planRides(days: OfficeDay[]): Planned {
  const ordered = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const viaLuzern = returnsViaLuzern(ordered);
  const slots: Slot[] = [];

  for (const day of ordered) {
    const key = routeKey(day);
    const route = ROUTES[key];
    const back =
      key === 'pre:zug' && viaLuzern.has(day.date) ? ZUG_BACK_VIA_LUZERN : route.back;

    for (const leg of [...route.out, ...back]) slots.push({ date: day.date, leg });
  }

  const lines = new Array<string>(slots.length);

  for (const pool of Object.keys(POOLS) as (keyof typeof POOLS)[]) {
    const indices = slots.flatMap((slot, index) => (slot.leg.pool === pool ? [index] : []));

    if (indices.length === 0) continue;

    const dealt = spread(allocate(POOLS[pool], indices.length), indices.length);

    indices.forEach((index, position) => {
      lines[index] = dealt[position];
    });
  }

  const byLine = new Map<string, number>();
  const rides = slots.map(({ date, leg }, index) => {
    const lineId = lines[index];

    if (leg.from === leg.to) {
      throw new Error(`${lineId} on ${date} starts and ends at ${leg.from}`);
    }

    byLine.set(lineId, (byLine.get(lineId) ?? 0) + 1);

    return { lineId, riddenOn: date, fromDidok: leg.from, toDidok: leg.to };
  });

  return { rides, byLine };
}
