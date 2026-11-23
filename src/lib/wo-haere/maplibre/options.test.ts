import { describe, expect, it } from 'vitest';
import { creditsFor, wandcharteOptions } from '@/lib/wo-haere/maplibre/options';
import { AASICHT_IDS } from '@/lib/wo-haere/types';

describe('Wandcharte map options', () => {
  for (const aasicht of AASICHT_IDS) {
    it(`turns MapLibre's attribution control off for '${aasicht}'`, () => {
      expect(wandcharteOptions(aasicht).attributionControl).toBe(false);
    });
  }
});

describe('Wandcharte credits', () => {
  it('credits only swisstopo on the paper map', () => {
    expect(creditsFor('charte')).toEqual([{ label: '© swisstopo' }]);
  });

  for (const aasicht of ['chugele', 'aaflug'] as const) {
    it(`credits OpenFreeMap, OpenMapTiles, OSM and swisstopo for '${aasicht}'`, () => {
      expect(creditsFor(aasicht)).toEqual([
        { label: 'OpenFreeMap', href: 'https://openfreemap.org' },
        { label: '© OpenMapTiles', href: 'https://www.openmaptiles.org/' },
        {
          label: 'Data from OpenStreetMap',
          href: 'https://www.openstreetmap.org/copyright',
        },
        { label: '© swisstopo' },
      ]);
    });
  }
});
