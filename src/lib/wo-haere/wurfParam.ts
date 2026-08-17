import { GRID_DECIMALS, type LatLon } from '@/lib/wo-haere/geo/ch';

/**
 * `?wurf=46.6200,8.0418` — a shared throw. Accepts the raw value from either a
 * searchParams object or a URLSearchParams lookup.
 */
export function parseWurf(
  raw: string | string[] | null | undefined,
): LatLon | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;

  const [latRaw, lonRaw] = value.split(',');
  const lat = Number.parseFloat(latRaw ?? '');
  const lon = Number.parseFloat(lonRaw ?? '');
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;

  return { lat, lon };
}

/**
 * The canonical `lat,lon` form used in shared links and OG image URLs. Kept on
 * the same grid as `snapToGrid`, so a shared throw hits the same upstream cache
 * key as the original.
 */
export function formatWurf({ lat, lon }: LatLon): string {
  return `${lat.toFixed(GRID_DECIMALS)},${lon.toFixed(GRID_DECIMALS)}`;
}
