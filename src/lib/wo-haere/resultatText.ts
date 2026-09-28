import { DERNAEBE, RESULTAT, kantonsName } from '@/lib/wo-haere/data/bern';
import type { Wurf } from '@/lib/wo-haere/geo/resolveHit';

/** The result card as one sentence, for the screen-reader live region. */
export function resultatText({
  wurf,
  ziuName,
  isPreich,
}: {
  wurf: Wurf;
  ziuName: string | null;
  isPreich: boolean;
}): string {
  if (wurf.art === 'dernaebe') {
    return `${DERNAEBE.titu} ${DERNAEBE[wurf.grund]}`;
  }

  const preicht = isPreich ? `${RESULTAT.preicht} ` : '';
  const verb = wurf.wasser ? RESULTAT.duLandischIm : RESULTAT.duGaschUf;
  const kanton = wurf.kanton
    ? `, ${RESULTAT.kanton} ${kantonsName(wurf.kanton)}`
    : '';

  return `${preicht}${verb} ${ziuName ?? wurf.gmeind}${kanton}`;
}
