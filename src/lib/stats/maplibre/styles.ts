import type { StyleSpecification } from 'maplibre-gl';

/**
 * The stats page's basemaps: land, water, country outlines. No labels.
 *
 * OpenFreeMap's `positron` and `dark` would do the job, but a third of their
 * layers are `symbol` layers, and a globe at zoom 1.5 covered in place names
 * reads as a map of the world rather than as the thing the flight paths are
 * drawn on. Flighty's globe carries no text at all, and the paths are the
 * subject here too.
 *
 * So the style is written out rather than fetched and filtered: three layers,
 * no `glyphs`, no `sprite`, and nothing to strip at runtime. The colours and
 * filters are lifted from those two styles so the globe still belongs to the
 * same family as the map wo häre? uses.
 *
 * The same three layers come in two projections: a globe for the flights and
 * a flat Mercator map for the rail network, which covers one small country and
 * would only bulge on a sphere.
 *
 * `projection` is declared here rather than set on `style.load`. It means the
 * map has its projection from its first frame, and — because both schemes
 * declare it — a `setStyle` diff never emits the `setProjection(undefined)`
 * that would reset it.
 */

/** Same host as the `liberty` style wo häre? uses, so the CSP is unchanged. */
const OPENMAPTILES_URL = 'https://tiles.openfreemap.org/planet';

const SOURCE_ID = 'openmaptiles';

type Scheme = 'light' | 'dark';

interface Palette {
  land: string;
  water: string;
  boundary: string;
}

const PALETTE: Record<Scheme, Palette> = {
  light: {
    land: 'rgb(242, 243, 240)',
    water: 'rgb(194, 200, 202)',
    boundary: 'hsl(0, 0%, 70%)',
  },
  dark: {
    land: 'rgb(12, 12, 12)',
    water: 'rgb(27, 27, 29)',
    boundary: 'hsl(0, 0%, 23%)',
  },
};

function basemap(
  scheme: Scheme,
  projection: 'globe' | 'mercator',
): StyleSpecification {
  const palette = PALETTE[scheme];

  return {
    version: 8,
    projection: { type: projection },
    sources: {
      [SOURCE_ID]: { type: 'vector', url: OPENMAPTILES_URL },
    },
    layers: [
      // Land is the background: OpenMapTiles has no land polygon, it has water
      // drawn over everything else.
      {
        id: 'land',
        type: 'background',
        paint: { 'background-color': palette.land },
      },
      {
        id: 'water',
        type: 'fill',
        source: SOURCE_ID,
        'source-layer': 'water',
        // Tunnels are culverts and aqueducts, which are not coastline.
        filter: [
          'all',
          [
            'match',
            ['geometry-type'],
            ['Polygon', 'MultiPolygon'],
            true,
            false,
          ],
          ['!=', ['get', 'brunnel'], 'tunnel'],
        ],
        paint: { 'fill-antialias': true, 'fill-color': palette.water },
      },
      // Countries only. `maritime` boundaries run out to sea and would draw a
      // second, wrong coastline; `claimed_by` is the disputed half of a border
      // that is already drawn from the other side.
      {
        id: 'boundary',
        type: 'line',
        source: SOURCE_ID,
        'source-layer': 'boundary',
        filter: [
          'all',
          ['==', ['get', 'admin_level'], 2],
          ['!=', ['get', 'maritime'], 1],
          ['!', ['has', 'claimed_by']],
        ],
        paint: {
          'line-color': palette.boundary,
          'line-width': ['interpolate', ['linear'], ['zoom'], 0, 0.5, 6, 1.2],
        },
      },
    ],
  };
}

export const globeStyle = (scheme: Scheme): StyleSpecification =>
  basemap(scheme, 'globe');

export const flatStyle = (scheme: Scheme): StyleSpecification =>
  basemap(scheme, 'mercator');
