import { ImageResponse } from 'next/og';

import { trackServer } from '@/lib/analytics/server/track-server';
import { APP, RESULTAT, kantonsName } from '@/lib/wo-haere/data/bern';
import { type LatLon } from '@/lib/wo-haere/geo/ch';
import { resolveHit, type Wurf } from '@/lib/wo-haere/geo/resolveHit';
import { noechschtsZiu } from '@/lib/wo-haere/reactions';
import { parseWurf } from '@/lib/wo-haere/wurfParam';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

interface Chaarte {
  titu: string;
  underTitu: string;
  zeile: string;
  resolved: boolean;
}

const GENERISCH: Chaarte = {
  titu: APP.name,
  underTitu: APP.tagline,
  zeile: '',
  resolved: false,
};

/** The line of detail under the place name, skipping whatever is missing. */
const detailZeile = (wurf: Extract<Wurf, { art: 'preich' }>) =>
  [
    wurf.kanton ? `${RESULTAT.kanton} ${kantonsName(wurf.kanton)}` : null,
    wurf.hoechi !== null ? `${wurf.hoechi} ${RESULTAT.ueberMeer}` : null,
    `${Math.round(wurf.distanzKm)} km ${RESULTAT.voBaern}`,
  ]
    .filter(Boolean)
    .join('  ·  ');

/** Resolves the shared throw into card copy, or falls back to the generic card. */
async function chaarteFür(wurfParam: LatLon | null): Promise<Chaarte> {
  if (!wurfParam) return GENERISCH;

  try {
    const wurf = await resolveHit(wurfParam);
    if (wurf.art !== 'preich') return GENERISCH;

    const nz = noechschtsZiu(wurfParam);
    return {
      titu: nz?.ziu.name ?? wurf.gmeind,
      underTitu: wurf.wasser ? RESULTAT.duLandischIm : RESULTAT.duGaschUf,
      zeile: detailZeile(wurf),
      resolved: true,
    };
  } catch {
    // Fall back to the generic card rather than failing the image.
    return GENERISCH;
  }
}

const Chaarte = ({ titu, underTitu, zeile }: Chaarte) => (
  <div
    style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      padding: '80px',
      background: '#e8dfcb',
      color: '#1c1917',
      fontFamily: 'sans-serif',
    }}
  >
    <div
      style={{
        display: 'flex',
        fontSize: 30,
        color: '#7f1d1d',
        fontWeight: 700,
      }}
    >
      {underTitu}
    </div>
    <div
      style={{
        display: 'flex',
        fontSize: 104,
        fontWeight: 900,
        lineHeight: 1.05,
      }}
    >
      {titu}
    </div>
    {zeile && (
      <div
        style={{
          display: 'flex',
          marginTop: 24,
          fontSize: 34,
          color: '#57534e',
        }}
      >
        {zeile}
      </div>
    )}
    <div
      style={{
        display: 'flex',
        marginTop: 'auto',
        fontSize: 26,
        color: '#78716c',
      }}
    >
      {APP.name} · © swisstopo
    </div>
  </div>
);

export async function GET(request: Request) {
  const cookieHeader = request.headers.get('cookie');
  const wurfParam = parseWurf(new URL(request.url).searchParams.get('wurf'));
  const chaarte = await chaarteFür(wurfParam);

  // Fires on every request, so crawlers and unfurl bots inflate it; most such
  // hits carry no `_ga` cookie and land as `client_source: 'synthetic'`. Read
  // it as a noisy share-reach proxy, not a clean count.
  trackServer(
    {
      name: 'og_unfurl_server',
      has_wurf: Boolean(wurfParam),
      resolved: chaarte.resolved,
    },
    cookieHeader,
  );

  return new ImageResponse(<Chaarte {...chaarte} />, size);
}
