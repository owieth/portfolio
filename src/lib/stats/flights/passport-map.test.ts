import { describe, expect, it } from 'vitest';

import { greatCirclePath } from '@/lib/stats/flights/geo';
import {
  passportMapDataUri,
  passportMapSvg,
} from '@/lib/stats/flights/passport-map';
import { MAP_SIZE } from '@/lib/stats/flights/projection';
import { SEED } from '@/lib/stats/flights/seed.fixture';
import { airportVisits, rankRoutes, toLegs } from '@/lib/stats/flights/stats';
import { WORLD_PATH } from '@/lib/stats/flights/world-path';

const LEGS = toLegs([...SEED]);

const SVG = passportMapSvg(LEGS);

describe('passportMapSvg', () => {
  it('is a single line, because a data uri cannot carry a newline', () => {
    // Satori matches the tail of a data URI with `.`, which does not cross a
    // newline. A pretty-printed SVG comes back as no image at all.
    expect(SVG.includes('\n')).toBe(false);
    expect(SVG.startsWith('<svg ')).toBe(true);
    expect(SVG.endsWith('</svg>')).toBe(true);
  });

  it('carries no NaN, no Infinity and no undefined', () => {
    // Every classic projection bug at once: a missing coordinate, a divide by
    // a zero-width window, a latitude read as a longitude. All three reach the
    // string as text, and resvg would drop the element without a word.
    expect(SVG).not.toMatch(/NaN|Infinity|undefined|null/);
  });

  it('draws one polyline per piece of every ranked route', () => {
    // Per LineString, not per route: `greatCirclePath` splits at the
    // antimeridian, and a route that wraps has to draw as two.
    const pieces = rankRoutes(LEGS).reduce(
      (total, route) =>
        total + greatCirclePath(route.a, route.b).coordinates.length,
      0,
    );

    expect(SVG.match(/<polyline /g)!.length).toBe(pieces);
  });

  it('draws a halo and a dot for every airport visited', () => {
    expect(SVG.match(/<circle /g)!.length).toBe(2 * airportVisits(LEGS).length);
  });

  it('keeps every drawn coordinate inside the map', () => {
    for (const pair of SVG.match(/points="([^"]+)"/g) ?? []) {
      for (const coordinate of pair.slice(8, -1).split(' ')) {
        const [x, y] = coordinate.split(',').map(Number);

        expect(Number.isFinite(x) && Number.isFinite(y), coordinate).toBe(true);
        expect(x, coordinate).toBeGreaterThanOrEqual(0);
        expect(x, coordinate).toBeLessThanOrEqual(MAP_SIZE.width);
        expect(y, coordinate).toBeGreaterThanOrEqual(0);
        expect(y, coordinate).toBeLessThanOrEqual(MAP_SIZE.height);
      }
    }
  });

  it('weights a repeated route more heavily than a once-flown one', () => {
    // The tiers reaching the card at all. Shared with the globe, scaled up
    // because this is a still seen at a third of its size.
    const widths = [...SVG.matchAll(/stroke-width="([\d.]+)"/g)].map(
      ([, width]) => Number(width),
    );

    expect(Math.max(...widths)).toBeGreaterThan(Math.min(...widths));
  });

  it('still draws the world when there is nothing to draw on it', () => {
    // The card falls back to the generic image on an empty log, so this is
    // unreachable from the route — but a map builder that needs flights to
    // produce a map would be the wrong shape.
    const empty = passportMapSvg([]);

    expect(empty).toContain(WORLD_PATH);
    expect(empty).not.toContain('<polyline');
    expect(empty).not.toContain('<circle');
  });

  it('is deterministic', () => {
    expect(passportMapSvg(LEGS)).toBe(SVG);
  });
});

describe('passportMapDataUri', () => {
  it('round-trips the svg', () => {
    const uri = passportMapDataUri(LEGS);

    expect(uri.startsWith('data:image/svg+xml;utf8,')).toBe(true);
    expect(decodeURIComponent(uri.split(',')[1])).toBe(SVG);
  });
});
