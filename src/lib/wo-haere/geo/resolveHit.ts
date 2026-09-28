import { wgs84ToLv95 } from '@/lib/wo-haere/geo/lv95';
import {
  BAERN,
  distanceKm,
  himmurichtig,
  isInChBbox,
  isUsland,
  isWasser,
  snapToGrid,
  type LatLon,
} from '@/lib/wo-haere/geo/ch';

const GEMEINDE_LAYER = 'ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill';
const IDENTIFY_URL =
  'https://api3.geo.admin.ch/rest/services/api/MapServer/identify';
const HEIGHT_URL = 'https://api3.geo.admin.ch/rest/services/height';

/** Boundaries and terrain do not move, so cache hard. */
const CACHE = { next: { revalidate: 60 * 60 * 24 * 30 } } as const;

const IDENTIFY_TIMEOUT_MS = 4000;
const HOECHI_TIMEOUT_MS = 2000;

interface IdentifyAttributes {
  gemname?: string;
  kanton?: string;
  gde_nr?: number;
  is_current_jahr?: boolean;
}

interface IdentifyRecord {
  attributes?: IdentifyAttributes;
}

interface IdentifyResponse {
  results?: IdentifyRecord[];
}

export type DernaebeGrund = 'usland' | 'grenzwasser' | 'nid_uf_der_charte';

export type Wurf =
  | {
      art: 'dernaebe';
      grund: DernaebeGrund;
      lat: number;
      lon: number;
    }
  | {
      art: 'preich';
      lat: number;
      lon: number;
      gmeind: string;
      kanton: string;
      gdeNr: number | null;
      hoechi: number | null;
      wasser: boolean;
      distanzKm: number;
      richtig: string;
    };

function identifyUrl(lon: number, lat: number, jahr?: number): string {
  // mapExtent and imageDisplay are required by the API even with tolerance=0;
  // a bogus extent silently returns zero results, so keep it around the point.
  const d = 0.05;
  const params = new URLSearchParams({
    geometry: `${lon},${lat}`,
    geometryType: 'esriGeometryPoint',
    layers: `all:${GEMEINDE_LAYER}`,
    mapExtent: `${lon - d},${lat - d},${lon + d},${lat + d}`,
    imageDisplay: '800,600,96',
    tolerance: '0',
    sr: '4326',
    returnGeometry: 'false',
  });
  if (jahr !== undefined) params.set('timeInstant', String(jahr));
  return `${IDENTIFY_URL}?${params}`;
}

async function identify(
  lon: number,
  lat: number,
  jahr?: number,
): Promise<IdentifyRecord[]> {
  const res = await fetch(identifyUrl(lon, lat, jahr), {
    ...CACHE,
    signal: AbortSignal.timeout(IDENTIFY_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`swisstopo identify failed with ${res.status}`);
  }

  const json = (await res.json()) as IdentifyResponse;
  return json.results ?? [];
}

function currentRecord(records: IdentifyRecord[]): IdentifyRecord | undefined {
  return records.find(r => r.attributes?.is_current_jahr === true);
}

async function fetchHoechi(lon: number, lat: number): Promise<number | null> {
  const { easting, northing } = wgs84ToLv95(lon, lat);
  const params = new URLSearchParams({
    easting: String(easting),
    northing: String(northing),
    sr: '2056',
  });

  try {
    const res = await fetch(`${HEIGHT_URL}?${params}`, {
      ...CACHE,
      signal: AbortSignal.timeout(HOECHI_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { height?: string };
    const height = Number.parseFloat(json.height ?? '');
    return Number.isFinite(height) ? Math.round(height) : null;
  } catch {
    return null;
  }
}

/**
 * Turns a dart's coordinate into a place.
 *
 * swisstopo's Gemeinde layer answers three questions in one request:
 *   - a current record        -> a real Swiss municipality (or a Swiss lake)
 *   - historical records only -> border water such as the French part of Léman
 *   - nothing at all          -> abroad
 *
 * The layer also holds a few foreign municipalities as current records
 * (BFS 7xxx: Liechtenstein, Büsingen, Campione). Those count as abroad too.
 *
 * The point is snapped to the grid first: this is the only place the app talks
 * to swisstopo, so snapping here keeps every upstream URL cache-aligned and
 * stops a caller from walking coordinates to generate unbounded requests.
 */
export async function resolveHit(rawPoint: LatLon): Promise<Wurf> {
  const point = snapToGrid(rawPoint);
  const { lat, lon } = point;

  if (!isInChBbox(point)) {
    return { art: 'dernaebe', grund: 'usland', lat, lon };
  }

  const all = await identify(lon, lat);
  const current = currentRecord(all);

  if (!current?.attributes?.gemname) {
    return {
      art: 'dernaebe',
      grund: all.length > 0 ? 'grenzwasser' : 'usland',
      lat,
      lon,
    };
  }

  const { gemname, kanton, gde_nr: gdeNr } = current.attributes;

  if (isUsland(gdeNr)) {
    return { art: 'dernaebe', grund: 'usland', lat, lon };
  }

  const hoechi = await fetchHoechi(lon, lat);

  return {
    art: 'preich',
    lat,
    lon,
    gmeind: gemname,
    kanton: kanton ?? '',
    gdeNr: gdeNr ?? null,
    hoechi,
    wasser: isWasser(gdeNr),
    distanzKm: distanceKm(BAERN, point),
    richtig: himmurichtig(BAERN, point),
  };
}
