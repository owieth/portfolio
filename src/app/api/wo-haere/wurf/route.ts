import { trackServer } from '@/lib/analytics/server/track-server';
import { resolveHit } from '@/lib/wo-haere/geo/resolveHit';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ fähler: 'Chei gültigs JSON' }, { status: 400 });
  }

  const { lat, lon } = (body ?? {}) as { lat?: unknown; lon?: unknown };

  if (typeof lat !== 'number' || typeof lon !== 'number') {
    return Response.json(
      { fähler: 'lat u lon müesse Zahle sy' },
      { status: 400 },
    );
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return Response.json(
      { fähler: 'lat u lon müesse ändlich sy' },
      { status: 400 },
    );
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return Response.json(
      { fähler: 'lat oder lon usserhalb vom Bereich' },
      { status: 400 },
    );
  }

  const cookieHeader = request.headers.get('cookie');
  const start = performance.now();

  try {
    const wurf = await resolveHit({ lat, lon });
    const upstream_ms = Math.round(performance.now() - start);

    trackServer(
      wurf.art === 'preich'
        ? {
            name: 'throw_resolved_server',
            art: wurf.art,
            upstream_ms,
            kanton: wurf.kanton,
            wasser: wurf.wasser,
            distanz_km: Math.round(wurf.distanzKm),
            richtig: wurf.richtig,
            ...(wurf.hoechi !== null ? { hoechi: wurf.hoechi } : {}),
          }
        : {
            name: 'throw_resolved_server',
            art: wurf.art,
            upstream_ms,
            grund: wurf.grund,
          },
      cookieHeader,
    );

    return Response.json(wurf);
  } catch (error) {
    console.error('resolveHit failed', error);
    trackServer(
      {
        name: 'swisstopo_error_server',
        upstream_ms: Math.round(performance.now() - start),
      },
      cookieHeader,
    );
    return Response.json(
      { fähler: 'swisstopo git grad nid Antwort' },
      { status: 502 },
    );
  }
}
