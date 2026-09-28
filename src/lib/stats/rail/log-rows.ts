import { formatCount } from '@/lib/stats/flights/format';
import type { RailLogTable } from '@/lib/stats/rail/log';

/**
 * The browser's half of `./log`: the packed table unpacked into the rows the
 * ride log renders. Apart from `./log` so the client bundle carries none of
 * the packing, which only ever runs on the server.
 */

/**
 * A ride ready to render. The ranks are its indices into the packed lists,
 * which are sorted the way the columns sort, so a column sorts on its rank.
 */
export interface RailLogRow {
  dayRank: number;
  lineRank: number;
  stretchRank: number;
  day: string;
  code: string;
  terminals: string;
  stretch: string;
}

/** One row per packed ride, in the order the rides were packed. */
export function logRows({
  days,
  lines,
  stretches,
  rides,
}: RailLogTable): RailLogRow[] {
  return rides.map(([day, line, stretch]) => ({
    dayRank: day,
    lineRank: line,
    stretchRank: stretch,
    day: days[day],
    code: lines[line][0],
    terminals: lines[line][1],
    stretch: stretches[stretch],
  }));
}

/**
 * Which rides a page shows, out of how many: `11–20 of 1’436 rides`. A page of
 * one ride names it alone rather than as a range of one.
 */
export function logRange(pageIndex: number, pageSize: number, total: number) {
  const rides = `${formatCount(total)} ${total === 1 ? 'ride' : 'rides'}`;

  if (total === 0) return rides;

  const first = pageIndex * pageSize + 1;
  const last = Math.min(total, first + pageSize - 1);

  return first === last
    ? `${formatCount(first)} of ${rides}`
    : `${formatCount(first)}–${formatCount(last)} of ${rides}`;
}
