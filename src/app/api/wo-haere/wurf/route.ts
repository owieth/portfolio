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

  try {
    return Response.json(await resolveHit({ lat, lon }));
  } catch (error) {
    console.error('resolveHit failed', error);
    return Response.json(
      { fähler: 'swisstopo git grad nid Antwort' },
      { status: 502 },
    );
  }
}
