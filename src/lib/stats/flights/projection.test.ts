import { describe, expect, it } from 'vitest';

import { AIRPORTS } from '@/lib/stats/flights/airports';
import {
  MAP_SIZE,
  MAP_WINDOW,
  projectEquirectangular,
} from '@/lib/stats/flights/projection';

/** How close to the edge an airport dot may sit before it looks clipped. */
const MARGIN_PX = 24;

describe('MAP_WINDOW', () => {
  it('runs west to east and south to north', () => {
    // The projection divides by these differences and never normalises, so a
    // window the wrong way round mirrors the map rather than failing.
    expect(MAP_WINDOW.west).toBeLessThan(MAP_WINDOW.east);
    expect(MAP_WINDOW.south).toBeLessThan(MAP_WINDOW.north);
  });

  it('matches the aspect ratio of the size it is drawn at', () => {
    // This is what keeps the projection isotropic. Retune the window without
    // retuning MAP_SIZE and the continents stretch; nothing else notices.
    const degrees =
      (MAP_WINDOW.east - MAP_WINDOW.west) /
      (MAP_WINDOW.north - MAP_WINDOW.south);

    expect(MAP_SIZE.width / degrees).toBeCloseTo(MAP_SIZE.height, 0);
  });
});

describe('projectEquirectangular', () => {
  it('puts the north-west corner at the origin', () => {
    expect(
      projectEquirectangular({ lat: MAP_WINDOW.north, lon: MAP_WINDOW.west }),
    ).toEqual([0, 0]);
  });

  it('puts the south-east corner at the far corner', () => {
    const [x, y] = projectEquirectangular({
      lat: MAP_WINDOW.south,
      lon: MAP_WINDOW.east,
    });

    expect(x).toBeCloseTo(MAP_SIZE.width, 6);
    expect(y).toBeCloseTo(MAP_SIZE.height, 6);
  });

  it('puts the centre of the window at the centre of the map', () => {
    const [x, y] = projectEquirectangular({
      lat: (MAP_WINDOW.north + MAP_WINDOW.south) / 2,
      lon: (MAP_WINDOW.east + MAP_WINDOW.west) / 2,
    });

    expect(x).toBeCloseTo(MAP_SIZE.width / 2, 6);
    expect(y).toBeCloseTo(MAP_SIZE.height / 2, 6);
  });

  it('counts latitude upwards and pixels downwards', () => {
    const [, north] = projectEquirectangular({ lat: 60, lon: 0 });
    const [, south] = projectEquirectangular({ lat: 40, lon: 0 });

    expect(north).toBeLessThan(south);
  });

  it('is linear, so a midpoint projects to a midpoint', () => {
    const [west] = projectEquirectangular({ lat: 0, lon: -90 });
    const [east] = projectEquirectangular({ lat: 0, lon: 30 });
    const [middle] = projectEquirectangular({ lat: 0, lon: -30 });

    expect(middle).toBeCloseTo((west + east) / 2, 6);
  });

  it('leaves every airport in the registry well inside the frame', () => {
    // The real point of the window being a constant: an airport added outside
    // it fails here, at `pnpm test`, rather than on somebody's timeline.
    for (const airport of Object.values(AIRPORTS)) {
      const [x, y] = projectEquirectangular(airport);

      expect(x, airport.iata).toBeGreaterThan(MARGIN_PX);
      expect(x, airport.iata).toBeLessThan(MAP_SIZE.width - MARGIN_PX);
      expect(y, airport.iata).toBeGreaterThan(MARGIN_PX);
      expect(y, airport.iata).toBeLessThan(MAP_SIZE.height - MARGIN_PX);
    }
  });

  it('projects a point outside the window outside the frame', () => {
    // No clamping on purpose: clipping is the renderer's job, and a clamped
    // point would quietly pile up on the edge instead of being visibly wrong.
    const [, y] = projectEquirectangular({ lat: -85, lon: 0 });

    expect(y).toBeGreaterThan(MAP_SIZE.height);
  });
});
