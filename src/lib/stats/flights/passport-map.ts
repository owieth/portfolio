/**
 * The map panel of the passport share card, as one SVG string.
 *
 * The globe on /stats cannot be reused: MapLibre needs WebGL and a tile
 * server, and an OG route has neither. What is reused is everything above the
 * renderer — the same `rankRoutes` and `airportVisits`, the same
 * `greatCirclePath`, the same tiers and the same accent — so the card and the
 * globe describe the same flights and weight them the same way. Only the
 * projection is new.
 *
 * A string, rather than JSX satori could render directly, because a string is
 * the return value of a pure function and `passport-map.test.ts` can read it.
 * The card hands it over as an `<img>` data URI.
 */

import { greatCirclePath } from '@/lib/stats/flights/geo';
import {
  MAP_SIZE,
  projectEquirectangular,
} from '@/lib/stats/flights/projection';
import { airportVisits, rankRoutes } from '@/lib/stats/flights/stats';
import {
  AIRPORT_VISIT_TIERS,
  ROUTE_FLIGHT_TIERS,
  SHARE_CARD_SCALE,
  tierValue,
} from '@/lib/stats/flights/tiers';
import type { FlightLeg } from '@/lib/stats/flights/types';
import { WORLD_PATH } from '@/lib/stats/flights/world-path';

/** The same green the globe draws its routes in. */
const ACCENT = '#71BC92';

/**
 * The card's own black, so the map has no edge: the continents float on the
 * same ground the bio page sits on rather than inside a visible rectangle.
 * Land stays low contrast, so the routes carry the image.
 */
const GROUND = '#000';
const LAND = '#242424';

/** A tenth of a pixel. Past that the string only gets longer. */
const round = (value: number) => Math.round(value * 10) / 10;

const point = (lat: number, lon: number) => {
  const [x, y] = projectEquirectangular({ lat, lon });

  return `${round(x)},${round(y)}`;
};

export function passportMapSvg(legs: FlightLeg[]): string {
  const arcs = rankRoutes(legs)
    .flatMap(route => {
      const width = round(
        tierValue(ROUTE_FLIGHT_TIERS, route.flights) * SHARE_CARD_SCALE,
      );

      // One polyline per LineString, not per route. `greatCirclePath` already
      // splits at the antimeridian, so a route that wraps arrives as two
      // pieces and each one draws on its own side of the map — which a single
      // polyline could not, and which this window is wide enough to need.
      return greatCirclePath(route.a, route.b).coordinates.map(
        line =>
          `<polyline points="${line.map(([lon, lat]) => point(lat, lon)).join(' ')}" fill="none" stroke="${ACCENT}" stroke-opacity="0.95" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`,
      );
    })
    .join('');

  const dots = airportVisits(legs)
    .map(({ airport, visits }) => {
      const radius = round(
        tierValue(AIRPORT_VISIT_TIERS, visits) * SHARE_CARD_SCALE,
      );
      const [x, y] = projectEquirectangular(airport);
      const centre = `cx="${round(x)}" cy="${round(y)}"`;

      // The halo is the same accent at low opacity rather than a second
      // colour, the way the globe does it.
      return `<circle ${centre} r="${round(radius + 3)}" fill="${ACCENT}" fill-opacity="0.25"/><circle ${centre} r="${radius}" fill="${ACCENT}"/>`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${MAP_SIZE.width}" height="${MAP_SIZE.height}" viewBox="0 0 ${MAP_SIZE.width} ${MAP_SIZE.height}"><rect width="${MAP_SIZE.width}" height="${MAP_SIZE.height}" fill="${GROUND}"/><path d="${WORLD_PATH}" fill="${LAND}" fill-rule="evenodd"/>${arcs}${dots}</svg>`;
}

export const passportMapDataUri = (legs: FlightLeg[]): string =>
  `data:image/svg+xml;utf8,${encodeURIComponent(passportMapSvg(legs))}`;
