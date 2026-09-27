import { formatShare } from '@/lib/stats/rail/format';
import type { RailLineProgress } from '@/lib/stats/rail/types';

/**
 * What `RailMap` needs of each line, worked out on the server and passed in
 * as a prop, so the page ships four fields per line drawn rather than every
 * line's full row, and the component only paints and names. Pure, like the
 * rest of this folder.
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
 * Pinned rather than left to the server's default locale, so the order is the
 * same whichever machine renders the page. Numeric, so the S2 comes before
 * the S10.
 */
const COLLATOR = new Intl.Collator('de-CH', { numeric: true });

/** A line with no stops can still be ridden, but has nothing to count. */
function detailOf({ touched, covered, stops }: RailLineProgress) {
  if (!touched) return 'Not ridden yet';
  if (stops === 0) return 'Ridden';

  return `${covered} of ${stops} ${stops === 1 ? 'stop' : 'stops'} · ${formatShare(covered, stops)}`;
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
