import { distanceKm, type LatLon } from '@/lib/wo-haere/geo/ch';
import { NOECHI_KM, PREICH_KM, ZIU, type Ziu } from '@/lib/wo-haere/data/ziu';
import type { Wurf } from '@/lib/wo-haere/geo/resolveHit';

export interface NoechschtsZiu {
  ziu: Ziu;
  distanzKm: number;
  isPreich: boolean;
}

/** Closest curated destination, if the dart landed near one. */
export function noechschtsZiu(point: LatLon): NoechschtsZiu | null {
  let best: NoechschtsZiu | null = null;

  for (const ziu of ZIU) {
    const distanzKm = distanceKm(point, { lat: ziu.lat, lon: ziu.lon });
    if (distanzKm > NOECHI_KM) continue;
    if (best && best.distanzKm <= distanzKm) continue;
    best = { ziu, distanzKm, isPreich: distanzKm <= PREICH_KM };
  }

  return best;
}

/**
 * One line of commentary on where the dart ended up. Ordered by how
 * interesting the observation is — water beats altitude beats geography.
 */
export function reaktion(wurf: Extract<Wurf, { art: 'preich' }>): string {
  const { hoechi, wasser, kanton, distanzKm, gmeind } = wurf;

  if (wasser) {
    return `Du bisch im Wasser gladet. Nimm d Badhose mit, süsch wird's chli glettig.`;
  }

  if (hoechi !== null) {
    if (hoechi >= 3500) {
      return "Da obe het's Iis u Gletscher. Ohni Seiu u Pickel gasch nid wyt.";
    }
    if (hoechi >= 2500) {
      return 'Hochaupin. Guet Schueh a u ds Wätter zwöimau aaluege.';
    }
    if (hoechi >= 1500) {
      return 'Schöni Höchi. Da obe schmöckt d Luft scho no anders.';
    }
    if (hoechi <= 300) {
      return 'Ganz unde. Da wachse fasch Palme, für Schwyzer Verhäutnis.';
    }
  }

  if (distanzKm <= 10) {
    return 'Fasch dehei. Du chasch mit em Velo — kei Uusred.';
  }
  if (distanzKm >= 200) {
    return `${Math.round(distanzKm)} km wäg. Das isch e richtigi Reis, nid e Uusflug.`;
  }

  if (kanton === 'ZH') {
    return 'Züri, äuä. Nimm gnue Gäud mit, ds Kaffi isch dert tüürer.';
  }
  if (kanton === 'BE') {
    return "Bärn — natürlech. Ds Pfyl weiss, wo's schön isch.";
  }
  if (kanton === 'TI') {
    return 'Süde! Gelati isch ab jetzt Pflicht.';
  }
  if (kanton === 'VS') {
    return 'Wallis. Wy, Sunne u Bärge, wo di chli chly mache.';
  }
  if (kanton === 'GR') {
    return 'Graubünde isch gross. Nimm Zyt mit, vöu Zyt.';
  }

  return `${gmeind} — kennsch das? Perfekt, de gisch es nächschte Wuchenändi.`;
}
