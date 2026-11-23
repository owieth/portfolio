import { describe, expect, it } from 'vitest';
import {
  flatStyle,
  globeStyle,
  OPENMAPTILES_ATTRIBUTION,
} from '@/lib/stats/maplibre/styles';

const STYLES = [
  ['globeStyle', globeStyle],
  ['flatStyle', flatStyle],
] as const;
const SCHEMES = ['light', 'dark'] as const;

describe('stats basemap attribution', () => {
  for (const [name, style] of STYLES) {
    for (const scheme of SCHEMES) {
      it(`${name}('${scheme}') pins the openmaptiles attribution`, () => {
        const source = style(scheme).sources.openmaptiles;

        expect(source).toMatchObject({
          attribution: OPENMAPTILES_ATTRIBUTION,
        });
      });
    }
  }

  it('keeps every OpenFreeMap credit and links only to fixed hosts', () => {
    const hrefs = [...OPENMAPTILES_ATTRIBUTION.matchAll(/href="([^"]+)"/g)].map(
      ([, href]) => href,
    );

    expect(hrefs).toEqual([
      'https://openfreemap.org',
      'https://www.openmaptiles.org/',
      'https://www.openstreetmap.org/copyright',
    ]);
  });
});
