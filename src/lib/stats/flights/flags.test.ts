import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { COUNTRIES } from '@/lib/stats/flights/countries';
import { flagSrc } from '@/lib/stats/flights/flags';

const DIRECTORY = new URL('../../../../public/flags/', import.meta.url);

const FILES = readdirSync(DIRECTORY);

describe('flagSrc', () => {
  it('points at a file that is actually there, for every country', () => {
    // The path is a template, so nothing but this stops a country being added
    // to the registry and rendering a broken image on /stats.
    for (const code of Object.keys(COUNTRIES)) {
      expect(flagSrc(code), code).toBe(`/flags/${code}.svg`);
      expect(FILES, code).toContain(`${code}.svg`);
    }
  });

  it('serves no flag for a country that is not flown', () => {
    // The other direction: a country dropped from the registry leaves a file
    // behind that nothing renders and nobody notices.
    expect(new Set(FILES)).toEqual(
      new Set(Object.keys(COUNTRIES).map(code => `${code}.svg`)),
    );
  });

  it('gives every flag a 3:2 viewBox', () => {
    // The chips are circles and crop with `object-cover`, which works off the
    // intrinsic ratio. A flag that arrived at some other ratio would crop by a
    // different amount than the ten beside it.
    for (const file of FILES) {
      const [x, y, width, height] = readFileSync(
        new URL(file, DIRECTORY),
        'utf8',
      )
        .match(/viewBox="([^"]+)"/)![1]
        .split(' ')
        .map(Number);

      expect([x, y], file).toEqual([0, 0]);
      expect(width / height, file).toBeCloseTo(1.5, 5);
    }
  });

  it('answers null for a code outside the registry', () => {
    expect(flagSrc('XX')).toBeNull();
  });

  it('does not resolve inherited object properties', () => {
    // `country` guards with `Object.hasOwn`; this is the assertion that keeps
    // `/flags/constructor.svg` from being a path this function will hand out.
    expect(flagSrc('toString')).toBeNull();
    expect(flagSrc('constructor')).toBeNull();
  });
});
