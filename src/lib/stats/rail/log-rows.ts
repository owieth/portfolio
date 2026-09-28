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
