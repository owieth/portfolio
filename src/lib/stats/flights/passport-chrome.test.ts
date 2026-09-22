import { describe, expect, it } from 'vitest';

import {
  PLANE_GLYPH_PATH,
  chipSvg,
  circularArrowSvg,
  dataUri,
  planePitch,
  securityStripSvg,
} from '@/lib/stats/flights/passport-chrome';

const wellFormed = (svg: string, name: string) => {
  // One line, because satori matches the tail of a data URI with `.`, which
  // does not cross a newline — a pretty-printed SVG comes back as no image at
  // all rather than as an error.
  expect(svg.includes('\n'), name).toBe(false);
  expect(svg.startsWith('<svg '), name).toBe(true);
  expect(svg.endsWith('</svg>'), name).toBe(true);
  expect(svg, name).not.toMatch(/NaN|Infinity|undefined|null/);
};

describe('PLANE_GLYPH_PATH', () => {
  it('is symmetric about the centre line of its box', () => {
    // A plane whose wings disagree by half a pixel looks bent at 18px and
    // fine at 200. Reading the path is cheaper than noticing that later.
    const ys = PLANE_GLYPH_PATH.match(/[ML][\d.]+ ([\d.]+)/g)!.map(pair =>
      Number(pair.split(' ')[1]),
    );

    expect(new Set(ys.map(y => Number((24 - y).toFixed(4))))).toEqual(
      new Set(ys),
    );
  });
});

describe('securityStripSvg', () => {
  it('fills the width it is given with planes', () => {
    const svg = securityStripSvg(1200, 44);

    wellFormed(svg, 'strip');
    expect(svg.match(/<path /g)!.length).toBeGreaterThan(24);
  });

  it('draws no text, because resvg has no font to draw it with', () => {
    // The home airport labels are satori's job, laid over this. A `<text>`
    // here would come back blank and nothing would say why.
    expect(securityStripSvg(1200, 44)).not.toContain('<text');
  });

  it('is deterministic', () => {
    expect(securityStripSvg(1200, 44)).toBe(securityStripSvg(1200, 44));
  });
});

describe('planePitch', () => {
  it('is the spacing the strip actually draws at', () => {
    // The card aligns its two interruptions to this, so a strip that spaced
    // its planes differently would leave half a wing showing beside the code.
    const pitch = planePitch(44);
    const positions = [
      ...securityStripSvg(1200, 44).matchAll(/translate\(([\d.]+) /g),
    ].map(([, x]) => Number(x));

    expect(positions[1] - positions[0]).toBeCloseTo(pitch, 6);
    expect(positions[5]).toBeCloseTo(pitch * 5, 6);
  });
});

describe('circularArrowSvg', () => {
  it('is well formed at the size it is asked for', () => {
    const svg = circularArrowSvg(18);

    wellFormed(svg, 'arrow');
    expect(svg).toContain('width="18"');
  });
});

describe('chipSvg', () => {
  it('carries the plane glyph and the contact pads', () => {
    const svg = chipSvg(46, 36);

    wellFormed(svg, 'chip');
    expect(svg).toContain(PLANE_GLYPH_PATH);
  });

  it('uses no gradient and no filter', () => {
    // The holographic treatment is Flighty's, and the site uses neither
    // anywhere else. Worth an assertion rather than a comment alone.
    expect(chipSvg(46, 36)).not.toMatch(/Gradient|filter/);
  });
});

describe('dataUri', () => {
  it('round-trips the svg', () => {
    const svg = chipSvg(46, 36);
    const uri = dataUri(svg);

    expect(uri.startsWith('data:image/svg+xml;utf8,')).toBe(true);
    expect(
      decodeURIComponent(uri.slice('data:image/svg+xml;utf8,'.length)),
    ).toBe(svg);
  });
});
