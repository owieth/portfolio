/**
 * What the ODbL asks of anything built from the OSM geometry.
 *
 * Kept as data rather than a sentence in the README, so it travels with the
 * geometry: the step writes it next to the cached responses, and the step that
 * emits `lines.geojson` embeds the same object in the file. A consumer that only
 * ever sees the file still sees the licence.
 */

export interface Attribution {
  text: string;
  license: string;
  licenseUrl: string;
  copyrightUrl: string;
  /** `osm3s.timestamp_osm_base` of every response it covers, by route type. */
  osmBase: Record<string, string>;
}

export const OSM_ATTRIBUTION = {
  text: '© OpenStreetMap contributors',
  license: 'ODbL-1.0',
  licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
  copyrightUrl: 'https://www.openstreetmap.org/copyright',
} as const satisfies Omit<Attribution, 'osmBase'>;

export const ATTRIBUTION_FILE = 'attribution.json';
