/**
 * The flat map the passport share card is drawn on.
 *
 * `geo.ts` is about the sphere — how far apart two airports are, and the arc
 * between them. This is the other half: where a point on that sphere lands on
 * a rectangle. The globe on /stats never needs it, because MapLibre projects
 * for itself; an OG image has no renderer to delegate to.
 *
 * Plate carrée, the simplest equirectangular there is: longitude and latitude
 * both map linearly. It distorts area badly towards the poles and every atlas
 * has a better answer, but the card draws land as a silhouette and routes as
 * arcs that were already sampled on the sphere by `greatCirclePath` — so the
 * projection only has to be consistent, not equal-area.
 */

import type { GeoPoint } from '@/lib/stats/flights/geo';

export interface MapWindow {
  /** Degrees, `west < east`. */
  west: number;
  east: number;
  /** Degrees, `south < north`. */
  north: number;
  south: number;
}

/**
 * The whole world by longitude, banded by latitude.
 *
 * Full 360° because the card should read as a world map rather than as a
 * region — a passport is about everywhere you could have gone, not only where
 * you went. The latitude band is where the compromise lives: a true ±90 map is
 * 2:1, which at any width wide enough to fill the card is far too tall to
 * leave room for the bio page underneath. 78°N to 62°S trims the two ice caps
 * and nothing else — it keeps Svalbard, Iceland, all of Patagonia and the
 * whole of New Zealand.
 *
 * Deliberately a constant and not derived from the flights. A window fitted to
 * the data would silently reframe itself every time a flight is added, and two
 * cards shared a year apart would not be comparable. An airport outside this
 * window is a deliberate edit here, and `projection.test.ts` says so.
 */
export const MAP_WINDOW: MapWindow = {
  west: -180,
  east: 180,
  north: 78,
  south: -62,
};

/**
 * Chosen to match `MAP_WINDOW`'s 360:140 aspect, so degrees of longitude and
 * of latitude are worth the same number of pixels and the continents keep
 * their shape. Retuning the window means retuning this too; the test holds the
 * two together to within half a pixel.
 */
export const MAP_SIZE = { width: 880, height: 342 };

export function projectEquirectangular(
  point: GeoPoint,
  window: MapWindow = MAP_WINDOW,
  size: { width: number; height: number } = MAP_SIZE,
): [x: number, y: number] {
  const { west, east, north, south } = window;

  return [
    ((point.lon - west) / (east - west)) * size.width,
    // Inverted, because latitude counts up and pixels count down.
    ((north - point.lat) / (north - south)) * size.height,
  ];
}
