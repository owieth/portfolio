import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { COUNTRIES } from '@/lib/stats/flights/countries';
import { FLAG_SVG, flagDataUri } from '@/lib/stats/flights/flag-data';

const DIRECTORY = new URL('../../../../public/flags/', import.meta.url);

const FILES = readdirSync(DIRECTORY);

describe('FLAG_SVG', () => {
  it('holds a flag for every country and no others', () => {
    // Both directions, the way `flags.test.ts` does it: a country added to the
    // registry without a rerun of `pnpm og:flags` leaves a gap in the card's
    // flag row, and a country removed leaves a flag nothing renders.
    expect(new Set(Object.keys(FLAG_SVG))).toEqual(
      new Set(Object.keys(COUNTRIES)),
    );
  });

  it('is byte-identical to the files /stats serves', () => {
    // This is the whole justification for duplicating the artwork into source:
    // the copy is only safe while something fails when it drifts.
    for (const code of Object.keys(COUNTRIES)) {
      const onDisk = readFileSync(
        new URL(`${code}.svg`, DIRECTORY),
        'utf8',
      ).trim();

      expect(FLAG_SVG[code as keyof typeof FLAG_SVG], code).toBe(onDisk);
    }
  });

  it('covers every file in the directory', () => {
    expect(new Set(FILES)).toEqual(
      new Set(Object.keys(FLAG_SVG).map(code => `${code}.svg`)),
    );
  });

  it('gives every flag a 3:2 viewBox', () => {
    // The chips are circles cropped with `objectFit: cover`, which works off
    // the intrinsic ratio. A flag at some other ratio crops by a different
    // amount than the ten beside it.
    for (const [code, svg] of Object.entries(FLAG_SVG)) {
      const [x, y, width, height] = svg
        .match(/viewBox="([^"]+)"/)![1]
        .split(' ')
        .map(Number);

      expect([x, y], code).toEqual([0, 0]);
      expect(width / height, code).toBeCloseTo(1.5, 5);
    }
  });
});

describe('flagDataUri', () => {
  it('round-trips the flag through the data uri', () => {
    // Satori parses the tail with `decodeURIComponent`, so this is the same
    // trip the renderer makes.
    for (const [code, svg] of Object.entries(FLAG_SVG)) {
      const uri = flagDataUri(code)!;

      expect(uri.startsWith('data:image/svg+xml;utf8,'), code).toBe(true);
      expect(decodeURIComponent(uri.split(',')[1]), code).toBe(svg);
    }
  });

  it('answers null for a code outside the registry', () => {
    expect(flagDataUri('XX')).toBeNull();
  });

  it('does not resolve inherited object properties', () => {
    // `Object.hasOwn`, not `in` — otherwise satori is handed the source of
    // `toString` as an image and throws mid-render.
    expect(flagDataUri('toString')).toBeNull();
    expect(flagDataUri('constructor')).toBeNull();
  });
});
