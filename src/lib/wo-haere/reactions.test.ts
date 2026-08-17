import { describe, expect, it } from 'vitest';

import { distanceKm, offset } from '@/lib/wo-haere/geo/ch';
import { NOECHI_KM, PREICH_KM, ZIU, type Ziu } from '@/lib/wo-haere/data/ziu';
import type { Wurf } from '@/lib/wo-haere/geo/resolveHit';
import { noechschtsZiu, reaktion } from '@/lib/wo-haere/reactions';

const ortVo = (ziu: Ziu) => ({ lat: ziu.lat, lon: ziu.lon });

/**
 * The most isolated curated destination, so a boundary test cannot accidentally
 * be answered by a neighbour. Found rather than hardcoded, because ZIU grows.
 */
const einsam = ZIU.map(ziu => ({
  ziu,
  nöchscht: Math.min(
    ...ZIU.filter(andere => andere !== ziu).map(andere =>
      distanceKm(ortVo(ziu), ortVo(andere)),
    ),
  ),
})).reduce((a, b) => (b.nöchscht > a.nöchscht ? b : a));

const preich = (über: Partial<Extract<Wurf, { art: 'preich' }>> = {}) =>
  ({
    art: 'preich',
    lat: 46.948,
    lon: 7.4474,
    gmeind: 'Muri bi Bärn',
    kanton: 'BE',
    gdeNr: 356,
    hoechi: 600,
    wasser: false,
    distanzKm: 50,
    richtig: 'im Oschte',
    ...über,
  }) satisfies Extract<Wurf, { art: 'preich' }>;

describe('the ZIU list the boundary tests rely on', () => {
  it('has one destination far enough from the others to test cleanly', () => {
    expect(einsam.nöchscht).toBeGreaterThan(2 * NOECHI_KM);
  });

  it('still uses the published radii', () => {
    // Everything below is expressed relative to these two, so pin them: the
    // relative tests would happily follow a changed constant.
    expect(NOECHI_KM).toBe(8);
    expect(PREICH_KM).toBe(0.6);
  });
});

describe('noechschtsZiu', () => {
  it('answers with the destination the dart landed on', () => {
    const treffer = noechschtsZiu(ortVo(einsam.ziu));

    expect(treffer?.ziu.name).toBe(einsam.ziu.name);
    expect(treffer?.distanzKm).toBeCloseTo(0, 9);
    expect(treffer?.isPreich).toBe(true);
  });

  /**
   * `offset` then `distanceKm` does not round-trip to the last bit, so a point
   * placed at exactly the boundary measures a few nanometres either side of it.
   * That makes `<=` versus `<` at the boundary untestable, and behaviourally
   * irrelevant. These helpers sit a millimetre inside and outside instead, which
   * is what the assertions claim.
   */
  const chuumDrinne = (km: number, bearing: number) =>
    offset(ortVo(einsam.ziu), km - 1e-6, bearing);
  const chuumDusse = (km: number, bearing: number) =>
    offset(ortVo(einsam.ziu), km + 1e-6, bearing);

  it('counts a bullseye a millimetre inside PREICH_KM', () => {
    const treffer = noechschtsZiu(chuumDrinne(PREICH_KM, 90));

    expect(treffer?.distanzKm).toBeCloseTo(PREICH_KM, 5);
    expect(treffer?.isPreich).toBe(true);
  });

  it('stops counting a bullseye a millimetre outside PREICH_KM', () => {
    const treffer = noechschtsZiu(chuumDusse(PREICH_KM, 90));

    expect(treffer?.ziu.name).toBe(einsam.ziu.name);
    expect(treffer?.isPreich).toBe(false);
  });

  it('still names the destination a millimetre inside NOECHI_KM', () => {
    const treffer = noechschtsZiu(chuumDrinne(NOECHI_KM, 180));

    expect(treffer?.ziu.name).toBe(einsam.ziu.name);
    expect(treffer?.distanzKm).toBeCloseTo(NOECHI_KM, 5);
    expect(treffer?.isPreich).toBe(false);
  });

  it('gives up a millimetre outside NOECHI_KM', () => {
    expect(noechschtsZiu(chuumDusse(NOECHI_KM, 180))).toBeNull();
  });

  it.each([
    [0.3, true],
    [0.59, true],
    [0.61, false],
    [4, false],
    [7.9, false],
  ])('reports %i km from a destination as a bullseye: %s', (km, isPreich) => {
    // Absolute distances, so a change to either radius shows up here even though
    // the tests above are written relative to the constants.
    const treffer = noechschtsZiu(offset(ortVo(einsam.ziu), km, 45));

    expect(treffer?.ziu.name).toBe(einsam.ziu.name);
    expect(treffer?.isPreich).toBe(isPreich);
  });

  it('gives up 10 km out, whatever the constants say', () => {
    expect(noechschtsZiu(offset(ortVo(einsam.ziu), 10, 45))).toBeNull();
  });

  it('picks the nearer of two destinations in range', () => {
    // Somewhere between two entries that are close together.
    const [a, b] = [...ZIU]
      .map(ziu => ziu)
      .flatMap((ziu, i) =>
        ZIU.slice(i + 1).map(andere => [ziu, andere] as const),
      )
      .filter(([x, y]) => {
        const d = distanceKm(ortVo(x), ortVo(y));
        return d > 1 && d < NOECHI_KM;
      })[0];
    const zwüsche = offset(ortVo(a), distanceKm(ortVo(a), ortVo(b)) * 0.3, 0);

    const treffer = noechschtsZiu(zwüsche);

    expect(treffer).not.toBeNull();
    expect(distanceKm(zwüsche, ortVo(treffer!.ziu))).toBeCloseTo(
      Math.min(...ZIU.map(ziu => distanceKm(zwüsche, ortVo(ziu)))),
      9,
    );
  });

  it('answers null far out at sea', () => {
    expect(noechschtsZiu({ lat: 0, lon: 0 })).toBeNull();
  });
});

describe('reaktion', () => {
  it('mentions the water before anything else', () => {
    // Water beats a glacier altitude, which is the whole point of the ordering.
    expect(
      reaktion(preich({ wasser: true, hoechi: 3600, kanton: 'ZH' })),
    ).toContain('Badhose');
  });

  it.each([
    [3500, 'Iis u Gletscher'],
    [3600, 'Iis u Gletscher'],
    [3499, 'Hochaupin'],
    [2500, 'Hochaupin'],
    [2499, 'Schöni Höchi'],
    [1500, 'Schöni Höchi'],
    [300, 'Palme'],
    [0, 'Palme'],
  ])('reads %i m as %s', (hoechi, schnipsu) => {
    expect(reaktion(preich({ hoechi }))).toContain(schnipsu);
  });

  it('falls through the altitude gap to the geography', () => {
    // 301–1499 m is most of the Mittelland, so it has to reach the later branches.
    expect(reaktion(preich({ hoechi: 600, distanzKm: 5 }))).toContain('Velo');
    expect(
      reaktion(preich({ hoechi: 1499, kanton: 'ZH', distanzKm: 50 })),
    ).toContain('Züri');
  });

  it('says the same thing when the altitude is unknown', () => {
    expect(reaktion(preich({ hoechi: null, distanzKm: 5 }))).toContain('Velo');
  });

  it.each([
    [10, 'Velo'],
    [9.9, 'Velo'],
  ])('calls %i km almost home', (distanzKm, schnipsu) => {
    expect(reaktion(preich({ hoechi: null, distanzKm }))).toContain(schnipsu);
  });

  it('calls exactly 200 km a proper journey', () => {
    expect(reaktion(preich({ hoechi: null, distanzKm: 200 }))).toContain(
      'richtigi Reis',
    );
    expect(reaktion(preich({ hoechi: null, distanzKm: 200 }))).toContain(
      '200 km',
    );
  });

  it('rounds the distance it quotes', () => {
    expect(reaktion(preich({ hoechi: null, distanzKm: 243.6 }))).toContain(
      '244 km',
    );
  });

  it.each([
    ['ZH', 'Züri'],
    ['BE', 'Bärn'],
    ['TI', 'Gelati'],
    ['VS', 'Wallis'],
    ['GR', 'Graubünde'],
  ])('has a line for %s', (kanton, schnipsu) => {
    expect(reaktion(preich({ hoechi: null, distanzKm: 50, kanton }))).toContain(
      schnipsu,
    );
  });

  it('falls back to the municipality name for the other cantons', () => {
    const antwort = reaktion(
      preich({ hoechi: null, distanzKm: 50, kanton: 'AG', gmeind: 'Zofige' }),
    );

    expect(antwort).toContain('Zofige');
    expect(antwort).toContain('Wuchenändi');
  });

  it('always says something', () => {
    for (const hoechi of [
      null,
      0,
      300,
      301,
      1499,
      1500,
      2499,
      2500,
      3499,
      3500,
    ]) {
      for (const distanzKm of [0, 10, 10.1, 199, 200]) {
        for (const kanton of ['AG', 'ZH', 'BE', 'TI', 'VS', 'GR', '']) {
          expect(
            reaktion(preich({ hoechi, distanzKm, kanton })).length,
          ).toBeGreaterThan(10);
        }
      }
    }
  });
});
