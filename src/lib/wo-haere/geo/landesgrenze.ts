/**
 * Whether a point is on Swiss soil, by the national border rather than the
 * bounding box.
 *
 * The rings come from swisstopo, simplified to about 1 km, so a point within a
 * kilometre of the border can land on either side. The Gemeinde lookup in
 * `resolveHit` stays the authority on where a throw actually landed.
 */

import { isInChBbox, type LatLon } from '@/lib/wo-haere/geo/ch';
import { LANDESGRENZE } from '@/lib/wo-haere/geo/landesgrenze-data';

/**
 * Even-odd ray casting over every ring at once, so a point inside one of the
 * enclave holes crosses two boundaries and comes out abroad.
 */
export function isInSchwyz(point: LatLon): boolean {
  if (!isInChBbox(point)) return false;

  const { lat, lon } = point;
  let dinne = false;

  for (const ring of LANDESGRENZE) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [lonI, latI] = ring[i];
      const [lonJ, latJ] = ring[j];
      if (
        latI > lat !== latJ > lat &&
        lon < ((lonJ - lonI) * (lat - latI)) / (latJ - latI) + lonI
      ) {
        dinne = !dinne;
      }
    }
  }

  return dinne;
}
