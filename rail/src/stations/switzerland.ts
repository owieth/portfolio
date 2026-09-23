/**
 * Is this station in Switzerland, and do the feed's two answers agree?
 *
 * The feed numbers every station with a Didok number, whose first two digits are
 * the UIC country code — `85` is Switzerland, `80` Germany, `83` Italy, `87`
 * France. That is the test. The bounding box is not a second test that gets a
 * vote; it is the cross-check that says whether the first one can be trusted,
 * which is why this function reports both answers and decides nothing about what
 * to do when they differ.
 *
 * The 2026 feed contains no station that is `85` and outside the box, so on the
 * data as it stands the two agree completely. The box is worth keeping anyway:
 * a Swiss station that turns up in the Atlantic is a broken coordinate, and a
 * Swiss station that quietly loses its `85` is a broken identity, and neither is
 * visible without asking the question twice.
 *
 * The converse — inside the box and not `85` — is not a contradiction at all.
 * The box is a rectangle over four borders, so it contains Lindau, Annemasse and
 * Bormio by construction. `stations.ts` counts those rather than listing them.
 */

import { isInChBbox } from '../../../src/lib/geo/ch.ts';

/** UIC country code 85. Every Swiss service point's Didok number starts with it. */
export const SWISS_COUNTRY = '85';

export interface Verdict {
  /** Kept iff the country code says Switzerland. Position never overrides it. */
  swiss: boolean;
  /** The UIC country code, or `null` when the Didok number is not seven digits. */
  country: string | null;
  /** The cross-check. `null` when the feed gave no coordinate to check against. */
  inBbox: boolean | null;
}

/**
 * Every Didok number in the 2026 feed is exactly seven digits, so `country` is
 * always populated in practice. It is typed nullable because a feed that broke
 * that has to arrive as a station this pipeline cannot place — counted and
 * reported — rather than as a station it silently calls foreign.
 */
export function classify(
  didok: string,
  lat: number | null,
  lon: number | null,
): Verdict {
  const country = /^\d{7}$/.test(didok) ? didok.slice(0, 2) : null;
  const inBbox = lat === null || lon === null ? null : isInChBbox({ lat, lon });

  return { swiss: country === SWISS_COUNTRY, country, inBbox };
}
