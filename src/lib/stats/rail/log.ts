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
