/**
 * The reference week: the one week `trips_per_week` is counted over.
 *
 * Named rather than implied, because no week of a Swiss feed is typical by
 * accident. The December feed opens on the timetable switch and runs straight
 * into Christmas and New Year timetables, spring carries Ascension and Whit
 * Monday, and a summer-only mountain line has zero trips in every week from
 * November to May. A week picked as "the first one in the feed" would count a
 * holiday timetable, and one picked in winter would call half the mountain lines
 * dead.
 *
 * The rule is the first full Monday-to-Sunday week of September, in the calendar
 * year the feed ends in:
 *
 * - the summer lines are still running — most close in mid to late October;
 * - no national holiday falls in it — 1 August is before it, and the Federal
 *   Day of Thanksgiving is the third Sunday of September, the 15th at the
 *   earliest, after the week ends on the 13th at the latest;
 * - most cantonal school holidays are over, so it is a working-week timetable;
 * - it is derived rather than hardcoded, so it means the same thing every
 *   December.
 *
 * The step returns the week alongside the service days it was checked against,
 * so a later step reads it from there instead of deriving its own.
 */

export interface DateRange {
  /** ISO date, inclusive. */
  first: string;
  /** ISO date, inclusive. */
  last: string;
}

const SEPTEMBER = 8;
const DAY_MS = 86_400_000;

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * UTC throughout, so the answer does not move with the machine's time zone — a
 * local `Date` at midnight is the previous day in UTC east of Greenwich, which is
 * everywhere this pipeline is run.
 */
export function referenceWeek(window: DateRange): DateRange {
  const year = Number(window.last.slice(0, 4));
  const firstOfSeptember = new Date(Date.UTC(year, SEPTEMBER, 1));
  // getUTCDay is 0 for Sunday; days to the next Monday, or 0 if it is one.
  const toMonday = (8 - firstOfSeptember.getUTCDay()) % 7;
  const monday = new Date(firstOfSeptember.getTime() + toMonday * DAY_MS);
  const sunday = new Date(monday.getTime() + 6 * DAY_MS);
  const week = { first: iso(monday), last: iso(sunday) };

  if (week.first < window.first || week.last > window.last) {
    throw new Error(
      `the reference week ${week.first} to ${week.last} is not inside the feed's ${window.first} to ${window.last}; a feed that does not cover September cannot count a week's trips`,
    );
  }

  return week;
}
