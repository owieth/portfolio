import { describe, expect, it } from 'vitest';

import { ATTRIBUTION, EC, S12 } from './fixtures.ts';
import { toCollection } from './geojson.ts';
import { assertWebCollection, toWebCollection, toWebFeature } from './web.ts';
import type { SourceCollection, SourceFeature, WebCollection } from './web.ts';

const SOURCE = toCollection([S12, EC], ATTRIBUTION) as SourceCollection;

const WIGGLE: SourceFeature = {
  type: 'Feature',
  properties: {
    id: 's-bahn-zuerich:S5',
    display_name: 'S5',
    category: 'S',
    network_region: 's-bahn-zuerich',
    match_rule: 'ref',
    confidence: 1,
    osm_relations: [7],
  },
  geometry: {
    type: 'MultiLineString',
    coordinates: [
      [
        [8.1, 47.1],
        [8.150001, 47.100002],
        [8.2, 47.1],
        [8.25, 47.15],
      ],
    ],
  },
};

describe('toWebFeature', () => {
  it('keeps only the id and the category', () => {
    expect(toWebFeature(WIGGLE, 30).properties).toEqual({
      id: 's-bahn-zuerich:S5',
      category: 'S',
    });
  });

  it('simplifies every part, keeping its ends', () => {
    expect(toWebFeature(WIGGLE, 30).geometry).toEqual({
      type: 'MultiLineString',
      coordinates: [
        [
          [8.1, 47.1],
          [8.2, 47.1],
          [8.25, 47.15],
        ],
      ],
    });
  });

  it('rounds what it keeps to five decimals', () => {
    const feature = toWebFeature(
      {
        ...WIGGLE,
        geometry: {
          type: 'MultiLineString',
          coordinates: [
            [
              [8.123456789, 47.987654321],
              [8.2, 47.1],
            ],
          ],
        },
      },
      30,
    );

    expect(feature.geometry.coordinates).toEqual([
      [
        [8.12346, 47.98765],
        [8.2, 47.1],
      ],
    ]);
  });
});

describe('toWebCollection', () => {
  it('carries the attribution over unchanged', () => {
    expect(toWebCollection(SOURCE, 30).attribution).toEqual(SOURCE.attribution);
  });

  it('keeps every feature, ordered by id', () => {
    const reversed = { ...SOURCE, features: [...SOURCE.features].reverse() };

    expect(
      toWebCollection(reversed, 30).features.map(feature => feature.properties.id),
    ).toEqual([EC.id, S12.id]);
  });
});

describe('assertWebCollection', () => {
  const web = toWebCollection(SOURCE, 30);

  it('passes a copy with the same lines and attribution', () => {
    expect(() => assertWebCollection(SOURCE, web)).not.toThrow();
  });

  it('throws when the copy is missing a line', () => {
    const short: WebCollection = { ...web, features: web.features.slice(1) };

    expect(() => assertWebCollection(SOURCE, short)).toThrow(
      `the web copy draws 1 lines where lines.geojson draws 2, missing ${EC.id}, so nothing was written`,
    );
  });

  it('throws when the copy draws a line the full file does not', () => {
    const extra: WebCollection = {
      ...web,
      features: [...web.features, toWebFeature(WIGGLE, 30)],
    };

    expect(() => assertWebCollection(SOURCE, extra)).toThrow(
      'with s-bahn-zuerich:S5 that lines.geojson does not have',
    );
  });

  it('throws when the copy draws a line twice', () => {
    const doubled: WebCollection = {
      ...web,
      features: [...web.features, ...web.features.slice(0, 1)],
    };

    expect(() => assertWebCollection(SOURCE, doubled)).toThrow(
      'the web copy draws 3 lines where lines.geojson draws 2',
    );
  });

  it('throws when a line has no part left', () => {
    const [first, ...rest] = web.features;
    const emptied: WebCollection = {
      ...web,
      features: [
        { ...first!, geometry: { type: 'MultiLineString', coordinates: [] } },
        ...rest,
      ],
    };

    expect(() => assertWebCollection(SOURCE, emptied)).toThrow(
      `${EC.id} has no part left after simplifying`,
    );
  });

  it('throws when the attribution differs', () => {
    const unlicensed: WebCollection = {
      ...web,
      attribution: { ...web.attribution, text: '' },
    };

    expect(() => assertWebCollection(SOURCE, unlicensed)).toThrow(
      'the web copy’s attribution differs',
    );
  });
});
