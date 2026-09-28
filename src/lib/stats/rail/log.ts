import type { RailRideLogEntry } from '@/lib/stats/rail/types';

/**
 * The ride log as the browser gets it. The table sorts and pages on the
 * client, so it needs every ride, but a row of formatted strings per ride is
 * most of what made the log heavy: a commute is a handful of lines and
 * stretches, spelled out again on every row.
 *
 * So each distinct day, line and stretch is spelled once, and a ride is three
 * indices into those lists. Each list is sorted the way its column sorts, which
 * makes an index a sort key as well: the browser orders the rows by comparing
 * integers, with no collator of its own to disagree with the server's.
 */

/** A line the way the log prints it: its code, then where it runs between. */
export type RailLogLine = [code: string, terminals: string];

/** A ride as indices into `days`, `lines` and `stretches`. */
export type RailLogRide = [day: number, line: number, stretch: number];

export interface RailLogTable {
  /** Formatted for display, oldest first. */
  days: string[];
  /** In the order the Line column sorts: by code, then by terminals. */
  lines: RailLogLine[];
  /** `From → To`, in the order the Stretch column sorts. */
  stretches: string[];
  /** In log order, newest first. */
  rides: RailLogRide[];
}

/** What the Stretch column says for a ride with no stops: it rode it all. */
export const WHOLE_LINE = 'Whole line';

/**
 * Pinned like the map's (`map.ts`), so the order is the same whichever machine
 * renders the page, and numeric, so the IC6 comes before the IC21. The
 * code-unit fallback makes the order total: two strings the collator calls
 * equal still land in one order every time.
 */
const COLLATOR = new Intl.Collator('de-CH', { numeric: true });

const byText = (x: string, y: string) =>
  COLLATOR.compare(x, y) || (x < y ? -1 : x > y ? 1 : 0);

/** Each value once, sorted, and a lookup from a value to where it landed. */
function ranked<T>(
  values: T[],
  keyOf: (value: T) => string,
  compare: (x: T, y: T) => number,
) {
  const distinct = new Map(values.map(value => [keyOf(value), value]));
  const sorted = [...distinct.values()].sort(compare);
  const index = new Map(sorted.map((value, i) => [keyOf(value), i]));

  return { sorted, indexOf: (value: T) => index.get(keyOf(value)) ?? -1 };
}

/**
 * Packs `rideLog`'s entries for the browser. A line is keyed by what the log
 * prints for it, so two ids that print the same are one entry. `formatDay`
 * runs once per distinct day rather than once per ride.
 */
export function toLogTable(
  log: RailRideLogEntry[],
  formatDay: (day: string) => string,
): RailLogTable {
  const printed = log.map(({ ride, line, from, to }) => ({
    day: ride.riddenOn,
    line: [
      line.displayName,
      `${line.terminalA} – ${line.terminalB}`,
    ] satisfies RailLogLine,
    stretch: from && to ? `${from} → ${to}` : WHOLE_LINE,
  }));

  // `YYYY-MM-DD` sorts as a date when it sorts as text.
  const days = ranked(
    printed.map(({ day }) => day),
    day => day,
    (x, y) => (x < y ? -1 : x > y ? 1 : 0),
  );
  const lines = ranked(
    printed.map(({ line }) => line),
    ([code, terminals]) => `${code}\n${terminals}`,
    (x, y) => byText(x[0], y[0]) || byText(x[1], y[1]),
  );
  const stretches = ranked(
    printed.map(({ stretch }) => stretch),
    stretch => stretch,
    byText,
  );

  return {
    days: days.sorted.map(formatDay),
    lines: lines.sorted,
    stretches: stretches.sorted,
    rides: printed.map(({ day, line, stretch }) => [
      days.indexOf(day),
      lines.indexOf(line),
      stretches.indexOf(stretch),
    ]),
  };
}
