import { ImageResponse } from 'next/og';

import { trackServer } from '@/lib/analytics/server/track-server';
import { APP, RESULTAT, kantonsName } from '@/lib/wo-haere/data/bern';
import { resolveHit } from '@/lib/wo-haere/geo/resolveHit';
import { noechschtsZiu } from '@/lib/wo-haere/reactions';
import { parseWurf } from '@/lib/wo-haere/wurfParam';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export async function GET(request: Request) {
  const cookieHeader = request.headers.get('cookie');
  const wurfParam = parseWurf(new URL(request.url).searchParams.get('wurf'));

  let titu: string = APP.name;
  let underTitu: string = APP.tagline;
  let zeile = '';
  let resolved = false;

  if (wurfParam) {
    try {
      const wurf = await resolveHit(wurfParam);
      resolved = wurf.art === 'preich';
      if (wurf.art === 'preich') {
        const nz = noechschtsZiu(wurfParam);
        titu = nz?.ziu.name ?? wurf.gmeind;
        underTitu = wurf.wasser ? RESULTAT.duLandischIm : RESULTAT.duGaschUf;
        zeile = [
          wurf.kanton ? `${RESULTAT.kanton} ${kantonsName(wurf.kanton)}` : null,
          wurf.hoechi !== null ? `${wurf.hoechi} ${RESULTAT.ueberMeer}` : null,
          `${Math.round(wurf.distanzKm)} km ${RESULTAT.voBaern}`,
        ]
          .filter(Boolean)
          .join('  ·  ');
      }
    } catch {
      // Fall back to the generic card rather than failing the image.
    }
  }

  // Fires on every request, so crawlers and unfurl bots inflate it; most such
  // hits carry no `_ga` cookie and land as `client_source: 'synthetic'`. Read
  // it as a noisy share-reach proxy, not a clean count.
  trackServer(
    { name: 'og_unfurl_server', has_wurf: Boolean(wurfParam), resolved },
    cookieHeader,
  );

  return new ImageResponse(
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
    </div>,
    size,
  );
}
