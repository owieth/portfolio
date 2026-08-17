import { describe, expect, it } from 'vitest';

import {
  BAERN,
  CH_BOUNDS,
  bearingDeg,
  distanceKm,
  himmurichtig,
  isInChBbox,
  isWasser,
  offset,
  type LatLon,
} from '@/lib/wo-haere/geo/ch';

const ZUERI: LatLon = { lat: 47.3769, lon: 8.5417 };
const GENF: LatLon = { lat: 46.2044, lon: 6.1432 };
const LUGANO: LatLon = { lat: 46.0037, lon: 8.9511 };
const BASU: LatLon = { lat: 47.5596, lon: 7.5886 };
const CHUR: LatLon = { lat: 46.8508, lon: 9.532 };

describe('distanceKm', () => {
  /** Straight-line distances, cross-checked against published city-pair figures. */
  it.each([
    ['Bärn – Züri', ZUERI, 95.5],
    ['Bärn – Genf', GENF, 129.5],
    ['Bärn – Lugano', LUGANO, 155.8],
    ['Bärn – Basu', BASU, 68.8],
    ['Bärn – Chur', CHUR, 158.7],
  ])('%s', (_name, to, erwartet) => {
    expect(distanceKm(BAERN, to)).toBeCloseTo(erwartet, 1);
  });

  it('is zero for a point against itself', () => {
    expect(distanceKm(BAERN, { ...BAERN })).toBe(0);
  });

  it('is symmetric', () => {
    expect(distanceKm(BAERN, LUGANO)).toBeCloseTo(distanceKm(LUGANO, BAERN), 9);
  });
});

describe('bearingDeg', () => {
  it('reads the cardinal directions off a neighbouring point', () => {
    // East and west only come out at exactly 90°/270° for a short hop: the
    // initial bearing of a long great circle along a parallel already tilts
    // polewards, which is correct and not a rounding artefact.
    const chly = 0.0001;

    expect(
      bearingDeg(BAERN, { lat: BAERN.lat + 1, lon: BAERN.lon }),
    ).toBeCloseTo(0, 6);
    expect(
      bearingDeg(BAERN, { lat: BAERN.lat - 1, lon: BAERN.lon }),
    ).toBeCloseTo(180, 6);
    expect(
      bearingDeg(BAERN, { lat: BAERN.lat, lon: BAERN.lon + chly }),
    ).toBeCloseTo(90, 3);
    expect(
      bearingDeg(BAERN, { lat: BAERN.lat, lon: BAERN.lon - chly }),
    ).toBeCloseTo(270, 3);
  });

  it('always answers in [0, 360)', () => {
    for (const bearing of [0, 45, 90, 135, 180, 225, 270, 315, 359]) {
      const gmässe = bearingDeg(BAERN, offset(BAERN, 40, bearing));

      expect(gmässe).toBeGreaterThanOrEqual(0);
      expect(gmässe).toBeLessThan(360);
    }
  });
});

describe('himmurichtig', () => {
  it.each([
    [0, 'im Norde'],
    [45, 'im Nordoschte'],
    [90, 'im Oschte'],
    [135, 'im Südoschte'],
    [180, 'im Süde'],
    [225, 'im Südweschte'],
    [270, 'im Weschte'],
    [315, 'im Nordweschte'],
  ])('names the sector centred on %i°', (bearing, erwartet) => {
    expect(himmurichtig(BAERN, offset(BAERN, 40, bearing))).toBe(erwartet);
  });

  it('rounds up at the sector boundary', () => {
    // Math.round breaks the 22.5° tie upward, so the boundary belongs to the
    // clockwise sector.
    expect(himmurichtig(BAERN, offset(BAERN, 40, 22.4))).toBe('im Norde');
    expect(himmurichtig(BAERN, offset(BAERN, 40, 22.6))).toBe('im Nordoschte');
  });

  it('wraps the eighth sector back round to north', () => {
    // 337.5° rounds to sector 8, which only lands inside the array because of the % 8.
    expect(himmurichtig(BAERN, offset(BAERN, 40, 337.6))).toBe('im Norde');
    expect(himmurichtig(BAERN, offset(BAERN, 40, 337.4))).toBe(
      'im Nordweschte',
    );
    expect(himmurichtig(BAERN, offset(BAERN, 40, 359.9))).toBe('im Norde');
  });
});

describe('offset', () => {
  it('leaves the point alone for a zero-length move', () => {
    const da = offset(BAERN, 0, 137);

    expect(da.lat).toBeCloseTo(BAERN.lat, 9);
    expect(da.lon).toBeCloseTo(BAERN.lon, 9);
  });

  it('round-trips against distanceKm and bearingDeg', () => {
    for (const km of [0.6, 8, 40, 150]) {
      for (const bearing of [0, 37, 90, 181, 275, 359]) {
        const da = offset(BAERN, km, bearing);

        expect(distanceKm(BAERN, da)).toBeCloseTo(km, 6);
        expect(bearingDeg(BAERN, da)).toBeCloseTo(bearing, 6);
      }
    }
  });

  it('comes back to the start along the return bearing', () => {
    // Not 71 + 180: on a sphere the return bearing is its own question, which is
    // exactly why the app asks bearingDeg rather than doing the arithmetic.
    const hi = offset(BAERN, 55, 71);
    const zrugg = offset(hi, 55, bearingDeg(hi, BAERN));

    expect(zrugg.lat).toBeCloseTo(BAERN.lat, 6);
    expect(zrugg.lon).toBeCloseTo(BAERN.lon, 6);
  });
});

describe('isInChBbox', () => {
  it('accepts the middle of the country', () => {
    expect(isInChBbox(BAERN)).toBe(true);
    expect(isInChBbox(LUGANO)).toBe(true);
  });

  it('treats every edge as inside', () => {
    const mittiLat = (CH_BOUNDS.south + CH_BOUNDS.north) / 2;
    const mittiLon = (CH_BOUNDS.west + CH_BOUNDS.east) / 2;

    expect(isInChBbox({ lat: mittiLat, lon: CH_BOUNDS.west })).toBe(true);
    expect(isInChBbox({ lat: mittiLat, lon: CH_BOUNDS.east })).toBe(true);
    expect(isInChBbox({ lat: CH_BOUNDS.south, lon: mittiLon })).toBe(true);
    expect(isInChBbox({ lat: CH_BOUNDS.north, lon: mittiLon })).toBe(true);
  });

  it('rejects a point a hair outside any edge', () => {
    const mittiLat = (CH_BOUNDS.south + CH_BOUNDS.north) / 2;
    const mittiLon = (CH_BOUNDS.west + CH_BOUNDS.east) / 2;
    const chly = 1e-6;

    expect(isInChBbox({ lat: mittiLat, lon: CH_BOUNDS.west - chly })).toBe(
      false,
    );
    expect(isInChBbox({ lat: mittiLat, lon: CH_BOUNDS.east + chly })).toBe(
      false,
    );
    expect(isInChBbox({ lat: CH_BOUNDS.south - chly, lon: mittiLon })).toBe(
      false,
    );
    expect(isInChBbox({ lat: CH_BOUNDS.north + chly, lon: mittiLon })).toBe(
      false,
    );
  });

  it('rejects the neighbours', () => {
    expect(isInChBbox({ lat: 48.8566, lon: 2.3522 })).toBe(false); // Paris
    expect(isInChBbox({ lat: 45.4642, lon: 9.19 })).toBe(false); // Milano
    expect(isInChBbox({ lat: 48.1351, lon: 11.582 })).toBe(false); // München
  });
});

describe('isWasser', () => {
  it.each([
    'Thunersee',
    'Bielersee',
    'Zürichsee',
    'Vierwaldstättersee',
    'Brienzersee',
    'Seeli',
    'Lac Léman',
    'Lac de Neuchâtel',
    'Lago Maggiore',
    'Lago di Lugano',
    'Lej da Segl',
    'Lai da Marmorera',
  ])('recognises %s', name => {
    expect(isWasser(name)).toBe(true);
  });

  it.each([
    'Bärn',
    'Seedorf',
    'Seengen',
    'Sempach',
    'Zermatt',
    'Lausanne',
    'Locarno',
    'Laax',
  ])('leaves %s on dry land', name => {
    expect(isWasser(name)).toBe(false);
  });

  it('ignores case, since swisstopo is not consistent about it', () => {
    expect(isWasser('THUNERSEE')).toBe(true);
    expect(isWasser('lago maggiore')).toBe(true);
  });
});
