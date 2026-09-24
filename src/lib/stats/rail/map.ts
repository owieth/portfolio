import type { RailLineProgress } from '@/lib/stats/rail/types';

/**
 * What `RailMap` needs of each line, worked out once on the way in so the
 * component only paints and names. Pure, like the rest of this folder.
 */

export interface RailMapLine {
  /** The `id` property of the line's feature in `public/rail/lines.geojson`. */
  id: string;
  /** `R13 · Yverdon-les-Bains – Biel/Bienne`: line numbers repeat by region. */
  name: string;
  touched: boolean;
  /** `4 of 10 stops · 40%`, or that it has not been ridden. */
  detail: string;
}

/**
 * Pinned for the reason `format.ts` pins `de-CH`: the list renders on the
 * server and hydrates. Numeric, so the S2 comes before the S10.
 */
const COLLATOR = new Intl.Collator('de-CH', { numeric: true });

/**
 * Floored rather than rounded, so 100% only ever means every stop: a line with
 * one stop left out of 300 would otherwise read as done.
 */
const percent = (share: number) => `${Math.floor(share * 100)}%`;

/** A line with no stops can still be ridden, but has nothing to count. */
function detailOf({ touched, covered, stops, share }: RailLineProgress) {
  if (!touched) return 'Not ridden yet';
  if (stops === 0) return 'Ridden';

  return `${covered} of ${stops} ${stops === 1 ? 'stop' : 'stops'} · ${percent(share)}`;
}

/**
 * The lines there is something to draw for, in the order a reader would look
 * one up. A line with no geometry is left out, since there is nothing on the
 * map to tap or to highlight; the page's tables still count it.
 */
export function mapLines(progress: RailLineProgress[]): RailMapLine[] {
  return progress
    .filter(({ line }) => line.hasGeometry)
    .map(entry => ({
      id: entry.line.id,
      name: `${entry.line.displayName} · ${entry.line.terminalA} – ${entry.line.terminalB}`,
      touched: entry.touched,
      detail: detailOf(entry),
    }))
    .sort(
      (x, y) =>
        COLLATOR.compare(x.name, y.name) || COLLATOR.compare(x.id, y.id),
    );
}
