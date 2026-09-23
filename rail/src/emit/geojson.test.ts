import { describe, expect, it } from 'vitest';

import { ATTRIBUTION, EC, GELMERBAHN, S12 } from './fixtures.ts';
import { roundParts, toCollection, toFeature, toGeoJson } from './geojson.ts';
import type { TerminiLine } from '../termini.ts';

describe('roundParts', () => {
  it('rounds every coordinate to five decimals, longitude first', () => {
    expect(roundParts([[[8.123456789, 47.987654321], [8.2, 47.1]]])).toEqual([
      [
        [8.12346, 47.98765],
        [8.2, 47.1],
      ],
    ]);
  });

  it('collapses the points that rounding made equal', () => {
    expect(
      roundParts([
        [
          [8.100001, 47.1],
          [8.100002, 47.100001],
          [8.2, 47.2],
          [8.1, 47.1],
        ],
      ]),
    ).toEqual([
      [
        [8.1, 47.1],
        [8.2, 47.2],
        [8.1, 47.1],
      ],
    ]);
  });

  it('drops a part that rounds to a single point', () => {
    expect(
      roundParts([
        [
          [8.100001, 47.1],
          [8.100002, 47.1],
        ],
        [
          [8.1, 47.1],
          [8.2, 47.2],
        ],
      ]),
    ).toEqual([
      [
        [8.1, 47.1],
        [8.2, 47.2],
      ],
    ]);
  });
});

describe('toFeature', () => {
  it('keys the feature by the line id, with its match in the properties', () => {
    const feature = toFeature(S12);

    expect(feature?.properties).toEqual({
      id: 's-bahn-zuerich:S12',
      display_name: 'S12',
      category: 'S',
      network_region: 's-bahn-zuerich',
      match_rule: 'ref',
      confidence: 1,
      osm_relations: [42, 101],
    });
    expect(feature?.geometry).toEqual({
      type: 'MultiLineString',
      coordinates: [
        [
          [8.20884, 47.48086],
          [8.46513, 47.43818],
          [8.72382, 47.50033],
          [9.04781, 47.4635],
        ],
        [
          [8.72382, 47.50033],
          [8.63276, 47.69828],
        ],
      ],
    });
  });

  it('leaves out a line with no geometry', () => {
    expect(toFeature(GELMERBAHN)).toBeNull();
  });

  it('refuses a line whose geometry rounds away to nothing', () => {
    const speck: TerminiLine = {
      ...S12,
      geometry: {
        type: 'MultiLineString',
        coordinates: [
          [
            [8.100001, 47.1],
            [8.100002, 47.1],
          ],
        ],
      },
    };

    expect(() => toFeature(speck)).toThrow(
      /line s-bahn-zuerich:S12 has geometry, but every part of it rounds to a single point/,
    );
  });
});

describe('toCollection', () => {
  it('holds one feature per line with geometry, ordered by id', () => {
    const collection = toCollection([S12, GELMERBAHN, EC], ATTRIBUTION);

    expect(collection.features.map(feature => feature.properties.id)).toEqual([
      EC.id,
      S12.id,
    ]);
  });

  it('carries the OSM attribution with its keys in a fixed order', () => {
    const { attribution } = toCollection([], {
      ...ATTRIBUTION,
      osmBase: { train: 't', funicular: 'f' },
    });

    expect(JSON.stringify(attribution)).toBe(
      '{"text":"© OpenStreetMap contributors","license":"ODbL-1.0","licenseUrl":"https://opendatacommons.org/licenses/odbl/1-0/","copyrightUrl":"https://www.openstreetmap.org/copyright","osmBase":{"funicular":"f","train":"t"}}',
    );
  });
});

describe('toGeoJson', () => {
  it('writes one feature per line between a header and a footer', () => {
    const text = toGeoJson(toCollection([S12, EC], ATTRIBUTION));
    const lines = text.split('\n');

    expect(lines).toHaveLength(5);
    expect(lines[0]).toMatch(/^\{"type":"FeatureCollection","attribution":\{.*\},"features":\[$/);
    expect(lines[1]).toMatch(/^\{"type":"Feature","properties":\{"id":"fernverkehr:EC:.*\}\},$/);
    expect(lines[2]).toMatch(/^\{"type":"Feature","properties":\{"id":"s-bahn-zuerich:S12".*\}\}$/);
    expect(lines.slice(3)).toEqual([']}', '']);
  });

  it('writes valid GeoJSON that reads back as the collection', () => {
    const collection = toCollection([S12, GELMERBAHN, EC], ATTRIBUTION);

    expect(JSON.parse(toGeoJson(collection))).toEqual(collection);
  });

  it('writes an empty collection as valid JSON', () => {
    const collection = toCollection([GELMERBAHN], ATTRIBUTION);

    expect(JSON.parse(toGeoJson(collection))).toEqual(collection);
  });
});
