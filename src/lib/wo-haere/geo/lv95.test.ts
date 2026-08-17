import { describe, expect, it } from 'vitest';

import { CH_BOUNDS } from '@/lib/wo-haere/geo/ch';
import { wgs84ToLv95 } from '@/lib/wo-haere/geo/lv95';

/**
 * Ground truth from swisstopo's reframe service, recorded once so the tests stay
 * offline:
 *
 *   curl "https://geodesy.geo.admin.ch/reframe/wgs84tolv95?easting=<lon>&northing=<lat>&format=json"
 *
 * `abweichigCm` is what the approximation actually costs at that point, measured
 * against these values. The approximation is a truncated series expanded around
 * Bern, so the error grows with distance from there: a few centimetres in the
 * Mittelland, a quarter of a metre down at Chiasso.
 */
const REFRAME = [
  {
    name: 'Bärn, Zytglogge',
    lon: 7.4474,
    lat: 46.948,
    easting: 2600667.4695879524,
    northing: 1199657.3047442625,
    abweichigCm: 2.9,
  },
  {
    name: 'the pair in the docblock',
    lon: 8.041,
    lat: 46.624,
    easting: 2646134.283112588,
    northing: 1163815.468746317,
    abweichigCm: 5.0,
  },
  {
    name: 'Jungfraujoch',
    lon: 7.9853,
    lat: 46.5474,
    easting: 2641927.6201379807,
    northing: 1155269.1598433678,
    abweichigCm: 5.8,
  },
  {
    name: 'Poschiavo',
    lon: 9.8767,
    lat: 46.4986,
    easting: 2787133.5045029367,
    northing: 1152606.0973108262,
    abweichigCm: 5.3,
  },
  {
    name: 'Rapperswil',
    lon: 8.8148,
    lat: 47.2266,
    easting: 2704219.5003720913,
    northing: 1231543.7008905187,
    abweichigCm: 11.4,
  },
  {
    name: 'Zermatt',
    lon: 7.6586,
    lat: 45.9767,
    easting: 2617047.8306265865,
    northing: 1091704.8800069918,
    abweichigCm: 16.1,
  },
  {
    name: 'Genève',
    lon: 6.1432,
    lat: 46.2044,
    easting: 2500016.0114594633,
    northing: 1117821.0588517769,
    abweichigCm: 16.4,
  },
  {
    name: 'Altstätte',
    lon: 9.5215,
    lat: 47.4923,
    easting: 2756944.2126828227,
    northing: 1262254.1439218423,
    abweichigCm: 18.3,
  },
  {
    name: 'Chiasso',
    lon: 8.9678,
    lat: 46.0037,
    easting: 2718454.6755763274,
    northing: 1095836.6179426329,
    abweichigCm: 27.1,
  },
] as const;

const abstandCm = (
  got: { easting: number; northing: number },
  soll: { easting: number; northing: number },
) => Math.hypot(got.easting - soll.easting, got.northing - soll.northing) * 100;

describe('wgs84ToLv95', () => {
  it('reproduces the constant terms at the point the series expands around', () => {
    // λ = φ = 0 in the formula, so only the constants survive. Any typo in
    // 600072.37 / 200147.07 or in either LV95 offset shows up here and nowhere else.
    const { easting, northing } = wgs84ToLv95(26782.5 / 3600, 169028.66 / 3600);

    expect(easting).toBeCloseTo(2_600_072.37, 6);
    expect(northing).toBeCloseTo(1_200_147.07, 6);
  });

  it('agrees with the reframe service to about 5 cm around Bern', () => {
    // The claim the case-study page makes. It holds where the app spends most of
    // its time; see the next test for what it costs at the edges.
    for (const soll of REFRAME.slice(0, 4)) {
      expect(
        abstandCm(wgs84ToLv95(soll.lon, soll.lat), soll),
        soll.name,
      ).toBeLessThan(10);
    }
  });

  it('stays within 30 cm of the reframe service everywhere in Switzerland', () => {
    for (const soll of REFRAME) {
      const abstand = abstandCm(wgs84ToLv95(soll.lon, soll.lat), soll);

      expect(abstand, soll.name).toBeLessThan(30);
      // Pinned per point, so a coefficient change cannot hide inside the loose bound.
      expect(abstand, soll.name).toBeCloseTo(soll.abweichigCm, 0);
    }
  });

  it('applies the LV95 offsets rather than returning LV03', () => {
    const { easting, northing } = wgs84ToLv95(8.041, 46.624);

    expect(easting).toBeGreaterThan(2_000_000);
    expect(northing).toBeGreaterThan(1_000_000);
  });

  it('is monotone in both axes across the country', () => {
    const west = wgs84ToLv95(CH_BOUNDS.west, 46.8);
    const east = wgs84ToLv95(CH_BOUNDS.east, 46.8);
    const south = wgs84ToLv95(8.2, CH_BOUNDS.south);
    const north = wgs84ToLv95(8.2, CH_BOUNDS.north);

    expect(east.easting).toBeGreaterThan(west.easting);
    expect(north.northing).toBeGreaterThan(south.northing);
  });

  it('keeps the whole bounding box inside plausible LV95 coordinates', () => {
    // The height endpoint answers null outside its own grid, so a conversion that
    // drifted by kilometres would degrade silently rather than fail.
    for (const lon of [CH_BOUNDS.west, CH_BOUNDS.east]) {
      for (const lat of [CH_BOUNDS.south, CH_BOUNDS.north]) {
        const { easting, northing } = wgs84ToLv95(lon, lat);

        expect(easting).toBeGreaterThan(2_450_000);
        expect(easting).toBeLessThan(2_860_000);
        expect(northing).toBeGreaterThan(1_060_000);
        expect(northing).toBeLessThan(1_310_000);
      }
    }
  });
});
