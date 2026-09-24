/**
 * What goes into `lines.geojson`, as pure functions from lines to text.
 *
 * One feature per line that has a shape, keyed by the same `id` as `lines.json`,
 * so the map joins to the list without a lookup table. A line with no shape is
 * left out rather than drawn empty; the report says why it has none.
 *
 * RFC 7946 throughout: WGS84 `[lon, lat]` and no `crs` member. The OSM
 * attribution rides along as a foreign member of the collection, so a consumer
 * that only ever sees the file still sees the licence.
 *
 * Coordinates are rounded to five decimals, about a metre here, which is finer
 * than any track is mapped and keeps a coordinate short. The text is written one
 * feature per line, so a diff names the lines whose shape changed instead of a
 * wall of coordinates.
 */

import type { Feature, FeatureCollection, MultiLineString, Position } from 'geojson';

import type { Category } from '../allowlist/categories.ts';
import type { Geometry } from '../match.ts';
import type { Rule } from '../match/rules.ts';
import { compare } from '../merge/key.ts';
import type { Attribution } from '../overpass/attribution.ts';
import type { TerminiLine } from '../termini.ts';

/** Decimal places kept per coordinate. */
export const GEOJSON_PRECISION = 5;

const SCALE = 10 ** GEOJSON_PRECISION;

export type FeatureProperties = {
  id: string;
  display_name: string;
  category: Category;
  network_region: string;
  match_rule: Rule;
  /** The share of the line's stations the shape reaches. */
  confidence: number;
  /** OSM relation ids, ascending. */
  osm_relations: number[];
};

export type LineFeature = Feature<MultiLineString, FeatureProperties>;

/** Generic over the properties, so the slimmed web copy is written the same way. */
export type LineCollection<Properties = FeatureProperties> = FeatureCollection<
  MultiLineString,
  Properties
> & {
  attribution: Attribution;
};

function round(value: number): number {
  return Math.round(value * SCALE) / SCALE;
}

function samePosition(a: Position | undefined, b: Position): boolean {
  return a?.[0] === b[0] && a?.[1] === b[1];
}

/**
 * Every part rounded, with the points rounding made equal collapsed into one,
 * and a part left shorter than a segment dropped: a LineString needs two
 * positions.
 */
export function roundParts(parts: Geometry['coordinates']): Position[][] {
  return parts
    .map(part =>
      part
        .map(([lon, lat]): Position => [round(lon), round(lat)])
        .filter((position, index, rounded) => !samePosition(rounded[index - 1], position)),
    )
    .filter(part => part.length >= 2);
}

export function toFeature(line: TerminiLine): LineFeature | null {
  if (!line.hasGeometry) {
    return null;
  }

  const coordinates = roundParts(line.geometry.coordinates);

  if (coordinates.length === 0) {
    throw new Error(
      `line ${line.id} has geometry, but every part of it rounds to a single point at ${GEOJSON_PRECISION} decimals, so nothing was written`,
    );
  }

  return {
    type: 'Feature',
    properties: {
      id: line.id,
      display_name: line.name,
      category: line.category,
      network_region: line.region,
      match_rule: line.match.rule,
      confidence: line.match.confidence,
      osm_relations: [...line.match.relations].sort((a, b) => a - b),
    },
    geometry: { type: 'MultiLineString', coordinates },
  };
}

/** Attribution built key by key, like every record, so its order never depends on the step that made it. */
export function toCollection(
  lines: readonly TerminiLine[],
  attribution: Attribution,
): LineCollection {
  return {
    type: 'FeatureCollection',
    attribution: {
      text: attribution.text,
      license: attribution.license,
      licenseUrl: attribution.licenseUrl,
      copyrightUrl: attribution.copyrightUrl,
      osmBase: Object.fromEntries(
        Object.entries(attribution.osmBase).sort(([a], [b]) => compare(a, b)),
      ),
    },
    features: lines
      .flatMap(line => toFeature(line) ?? [])
      .sort((a, b) => compare(a.properties.id, b.properties.id)),
  };
}

/** The collection as JSON, its header on the first line and one feature per line after it. */
export function toGeoJson<Properties>(collection: LineCollection<Properties>): string {
  const header = JSON.stringify({
    type: collection.type,
    attribution: collection.attribution,
  }).slice(0, -1);
  const features = collection.features.map(feature => JSON.stringify(feature));
  const body = features.length === 0 ? '' : `\n${features.join(',\n')}\n`;

  return `${header},"features":[${body}]}\n`;
}
