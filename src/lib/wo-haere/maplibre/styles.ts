import type { StyleSpecification } from 'maplibre-gl';
import { CH_BOUNDS } from '@/lib/wo-haere/geo/ch';
import { ATTRIBUTION } from '@/lib/wo-haere/data/bern';

/**
 * swisstopo's national map. Public, no API key — verified with a plain GET
 * during development. `bounds` keeps the client from requesting tiles for
 * the rest of the planet, since the layer only covers Switzerland.
 */
const SWISSTOPO_TILES =
  'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg';

/** OpenFreeMap serves world vector tiles with no key and no rate limit. */
export const WAEUT_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

const SWISSTOPO_SOURCE = {
  type: 'raster' as const,
  tiles: [SWISSTOPO_TILES],
  tileSize: 256,
  minzoom: 0,
  maxzoom: 17,
  bounds: [
    CH_BOUNDS.west,
    CH_BOUNDS.south,
    CH_BOUNDS.east,
    CH_BOUNDS.north,
  ] as [number, number, number, number],
  attribution: ATTRIBUTION.swisstopo,
};

export const SWISSTOPO_SOURCE_ID = 'swisstopo';
export const SWISSTOPO_LAYER_ID = 'swisstopo-charte';

/**
 * The paper map: swisstopo on a warm paper background, nothing else. Used for
 * the Charte view, where the whole point is that it looks like a printed
 * Landeskarte taped to a wall.
 */
export const CHARTE_STYLE: StyleSpecification = {
  version: 8,
  sources: { [SWISSTOPO_SOURCE_ID]: SWISSTOPO_SOURCE },
  layers: [
    {
      id: 'papier',
      type: 'background',
      paint: { 'background-color': '#e8dfcb' },
    },
    {
      id: SWISSTOPO_LAYER_ID,
      type: 'raster',
      source: SWISSTOPO_SOURCE_ID,
      paint: { 'raster-opacity': 1 },
    },
  ],
};

export { SWISSTOPO_SOURCE };
