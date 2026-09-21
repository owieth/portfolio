import { describe, expect, it } from 'vitest';

import { AIRLINES, airline } from '@/lib/stats/flights/airlines';
import { SEED } from '@/lib/stats/flights/seed.fixture';

const ENTRIES = Object.entries(AIRLINES);
const HEX = /^#[0-9A-F]{6}$/;

/** WCAG 2.x relative luminance, sRGB. */
const luminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5]
    .map(at => parseInt(hex.slice(at, at + 2), 16) / 255)
    .map(channel =>
      channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a: string, b: string): number => {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);

  return (lighter + 0.05) / (darker + 0.05);
};

describe('AIRLINES', () => {
  it('keys every entry by its own IATA code', () => {
    for (const [code, entry] of ENTRIES) {
      expect(entry.iata, code).toBe(code);
    }
  });

  it('resolves every carrier in the seed', () => {
    // Reads the seed rather than a copy of it, so a sixth carrier added to the
    // migration fails here instead of rendering as a bare two-letter code.
    for (const { airline: code } of SEED) {
      expect(airline(code), code).not.toBeNull();
    }
  });

  it('holds the five carriers the seed flies, and no more', () => {
    expect(new Set(Object.keys(AIRLINES))).toEqual(
      new Set(SEED.map(({ airline: code }) => code)),
    );
  });

  it('writes both colours as uppercase six-digit hex', () => {
    // The chip interpolates these straight into a style attribute, and the
    // contrast check below parses them with `parseInt`, which would quietly
    // accept `#abc` and compute nonsense.
    for (const [code, { colour, onColour }] of ENTRIES) {
      expect(colour, code).toMatch(HEX);
      expect(onColour, code).toMatch(HEX);
    }
  });

  it('sets the code in a colour that clears WCAG AA on the brand colour', () => {
    // Recomputed rather than trusted. KLM is why: #00A1DE is light enough that
    // white fails at 2.94:1, so the honest answer there is black.
    for (const [code, { colour, onColour }] of ENTRIES) {
      expect(['#FFFFFF', '#000000'], code).toContain(onColour);
      expect(contrast(colour, onColour), code).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('answers null for a carrier outside the registry', () => {
    expect(airline('XX')).toBeNull();
  });

  it('does not resolve inherited object properties', () => {
    expect(airline('toString')).toBeNull();
    expect(airline('constructor')).toBeNull();
  });
});
