/**
 * Whether a point is in Switzerland, by the national border rather than by the
 * `CH_BOUNDS` rectangle, which takes in large parts of the neighbours.
 *
 * Both imports go through `@/` rather than `./` so the simulator can load this
 * file through scripts/lib/ts-alias.mjs.
 */

import { isInChBbox, type LatLon } from '@/lib/wo-haere/geo/ch';
import { LANDESGRENZE } from '@/lib/wo-haere/geo/landesgrenze-data';

/**
 * Even-odd ray casting over every ring at once, so a point in the Büsingen or
 * Campione hole crosses two boundaries and comes out abroad.
 */
export function isInSchwyz(point: LatLon): boolean {
  if (!isInChBbox(point)) return false;

  const { lat, lon } = point;
  let drinne = false;

  for (const ring of LANDESGRENZE) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [lonI, latI] = ring[i];
      const [lonJ, latJ] = ring[j];

      if (
        latI > lat !== latJ > lat &&
        lon < lonI + ((lat - latI) * (lonJ - lonI)) / (latJ - latI)
      ) {
        drinne = !drinne;
      }
    }
  }

  return drinne;
}
