/**
 * The copy of `lines.geojson` the map downloads, as pure functions from the full
 * collection to a slim one.
 *
 * The full file is for review and diffing and is far too heavy for a phone. The
 * web copy keeps the same features under the same ids, simplified to what a
 * Swiss-wide map can show and rounded like the full file. Its properties are cut
 * to `id`, which joins to `rail_lines`, and `category`, which the map styles by;
 * everything else is read from Postgres by `id`.
 *
 * The OSM attribution is carried over untouched, because the ODbL asks for it
 * on anything built from the geometry, and a simplified shape is still that.
 */

import { isDeepStrictEqual } from 'node:util';

import type { Feature, FeatureCollection, MultiLineString } from 'geojson';

import type { Category } from '../allowlist/categories.ts';
import type { Geometry } from '../match.ts';
import { compare } from '../merge/key.ts';
import type { Attribution } from '../overpass/attribution.ts';
import { roundParts } from './geojson.ts';
import type { FeatureProperties, LineCollection } from './geojson.ts';
import { simplifyParts } from './simplify.ts';

export type WebProperties = {
  id: string;
  category: Category;
};

export type WebFeature = Feature<MultiLineString, WebProperties>;

export type WebCollection = LineCollection<WebProperties>;

/** `lines.geojson` as read back, its coordinates the `[lon, lat]` pairs it was written with. */
export type SourceCollection = FeatureCollection<Geometry, FeatureProperties> & {
  attribution: Attribution;
};

export type SourceFeature = SourceCollection['features'][number];

export function toWebFeature(feature: SourceFeature, toleranceM: number): WebFeature {
  const coordinates = roundParts(simplifyParts(feature.geometry.coordinates, toleranceM));

  return {
    type: 'Feature',
    properties: { id: feature.properties.id, category: feature.properties.category },
    geometry: { type: 'MultiLineString', coordinates },
  };
}

export function toWebCollection(source: SourceCollection, toleranceM: number): WebCollection {
  return {
    type: 'FeatureCollection',
    attribution: source.attribution,
    features: source.features
      .map(feature => toWebFeature(feature, toleranceM))
      .sort((a, b) => compare(a.properties.id, b.properties.id)),
  };
}

/**
 * The web copy draws exactly the lines the full file draws and carries its
 * attribution unchanged. A line missing from it would never show as ridden, and
 * a copy without the licence could not be published at all.
 */
export function assertWebCollection(source: SourceCollection, web: WebCollection): void {
  const expected = new Set(source.features.map(feature => feature.properties.id));
  const actual = new Set(web.features.map(feature => feature.properties.id));
  const missing = [...expected].find(id => !actual.has(id));
  const stray = [...actual].find(id => !expected.has(id));

  if (missing !== undefined || stray !== undefined || web.features.length !== actual.size) {
    throw new Error(
      `the web copy draws ${web.features.length} lines where lines.geojson draws ${expected.size}${missing === undefined ? '' : `, missing ${missing}`}${stray === undefined ? '' : `, with ${stray} that lines.geojson does not have`}, so nothing was written`,
    );
  }

  const empty = web.features.find(feature => feature.geometry.coordinates.length === 0);

  if (empty !== undefined) {
    throw new Error(
      `${empty.properties.id} has no part left after simplifying, so nothing was written`,
    );
  }

  if (!isDeepStrictEqual(web.attribution, source.attribution)) {
    throw new Error(
      'the web copy’s attribution differs from lines.geojson’s, so nothing was written',
    );
  }
}
