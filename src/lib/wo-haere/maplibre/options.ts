import type { MapOptions, StyleSpecification } from 'maplibre-gl';
import { ATTRIBUTION } from '@/lib/wo-haere/data/bern';
import { CH_BOUNDS } from '@/lib/wo-haere/geo/ch';
import { CHARTE_STYLE, WAEUT_STYLE } from '@/lib/wo-haere/maplibre/styles';
import type { Aasicht } from '@/lib/wo-haere/types';

/**
 * The camera is kept near Switzerland, but with slack around it. `maxBounds`
 * forces a minimum zoom at which the viewport fits *inside* the bounds, and
 * because Switzerland is far wider than tall that stops a portrait phone from
 * ever showing the whole country. The padding buys back that room.
 */
export const CH_ROOM: [[number, number], [number, number]] = [
  [CH_BOUNDS.west - 3.5, CH_BOUNDS.south - 3.5],
  [CH_BOUNDS.east + 3.5, CH_BOUNDS.north + 3.5],
];

export function styleFor(aasicht: Aasicht): string | StyleSpecification {
  return aasicht === 'charte' ? CHARTE_STYLE : WAEUT_STYLE;
}

/**
 * MapLibre's attribution control is off: it writes each source's attribution
 * with `innerHTML` behind a denylist sanitizer, and the `liberty` style's
 * attribution comes from OpenFreeMap at run time. The credits are rendered as
 * React text from `creditsFor` instead.
 */
export function wandcharteOptions(
  aasicht: Aasicht,
): Omit<MapOptions, 'container'> {
  return {
    style: styleFor(aasicht),
    center: [8.2, 46.8],
    zoom: aasicht === 'charte' ? 7 : 2.2,
    attributionControl: false,
    dragRotate: false,
    maxBounds: aasicht === 'charte' ? CH_ROOM : undefined,
  };
}

export interface Credit {
  label: string;
  href?: string;
}

/** The credits OpenFreeMap serves with the `liberty` style, with fixed links. */
const OPENFREEMAP_CREDITS: Credit[] = [
  { label: 'OpenFreeMap', href: 'https://openfreemap.org' },
  { label: '© OpenMapTiles', href: 'https://www.openmaptiles.org/' },
  {
    label: 'Data from OpenStreetMap',
    href: 'https://www.openstreetmap.org/copyright',
  },
];

const SWISSTOPO_CREDIT: Credit = { label: ATTRIBUTION.swisstopo };

/**
 * The globe views draw swisstopo over the world style once zoomed into
 * Switzerland, so they credit both.
 */
export function creditsFor(aasicht: Aasicht): Credit[] {
  return aasicht === 'charte'
    ? [SWISSTOPO_CREDIT]
    : [...OPENFREEMAP_CREDITS, SWISSTOPO_CREDIT];
}
