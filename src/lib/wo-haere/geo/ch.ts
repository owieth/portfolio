export interface LatLon {
  lat: number;
  lon: number;
}

/** Bern, Zytglogge — every distance in the app is measured from here. */
export const BAERN: LatLon = { lat: 46.948, lon: 7.4474 };

/** Bounding box of Swiss territory, used to clamp throws and the map view. */
export const CH_BOUNDS = {
  west: 5.9559,
  south: 45.818,
  east: 10.4921,
  north: 47.8085,
} as const;

export function isInChBbox({ lat, lon }: LatLon): boolean {
  return (
    lon >= CH_BOUNDS.west &&
    lon <= CH_BOUNDS.east &&
    lat >= CH_BOUNDS.south &&
    lat <= CH_BOUNDS.north
  );
}

/**
 * Grid resolution for coordinates sent upstream and shared in links.
 * 4 decimals is ~7-11m at Swiss latitudes — far below the app's resolution,
 * and enough to collapse adjacent throws onto one cache key.
 */
export const GRID_DECIMALS = 4;

export function snapToGrid({ lat, lon }: LatLon): LatLon {
  const f = 10 ** GRID_DECIMALS;
  return { lat: Math.round(lat * f) / f, lon: Math.round(lon * f) / f };
}

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

export function distanceKm(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export function bearingDeg(from: LatLon, to: LatLon): number {
  const dLon = toRad(to.lon - from.lon);
  const y = Math.sin(dLon) * Math.cos(toRad(to.lat));
  const x =
    Math.cos(toRad(from.lat)) * Math.sin(toRad(to.lat)) -
    Math.sin(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Berndeutsch compass directions, indexed by 45° sector. */
const HIMMURICHTIGE = [
  'im Norde',
  'im Nordoschte',
  'im Oschte',
  'im Südoschte',
  'im Süde',
  'im Südweschte',
  'im Weschte',
  'im Nordweschte',
] as const;

export function himmurichtig(from: LatLon, to: LatLon): string {
  const sector = Math.round(bearingDeg(from, to) / 45) % 8;
  return HIMMURICHTIGE[sector];
}

/** Move a point by a distance and bearing — used by the Zieh power curve. */
export function offset(origin: LatLon, km: number, bearing: number): LatLon {
  const angular = km / EARTH_RADIUS_KM;
  const lat1 = toRad(origin.lat);
  const lon1 = toRad(origin.lon);
  const brg = toRad(bearing);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) +
      Math.cos(lat1) * Math.sin(angular) * Math.cos(brg),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(brg) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
    );

  return { lat: toDeg(lat2), lon: toDeg(lon2) };
}

/**
 * swisstopo returns lakes as "Gemeinden" too, with the lake as the name.
 * That is how the app detects water without shipping any polygons.
 */
export function isWasser(gemname: string): boolean {
  return (
    /(see|seeli)$/i.test(gemname) || /^(lac|lago|lej|lai)\b/i.test(gemname)
  );
}
