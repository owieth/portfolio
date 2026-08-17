import { describe, expect, it } from 'vitest';

import {
  CH_BOUNDS,
  distanceKm,
  isInChBbox,
  offset,
  type LatLon,
} from '@/lib/wo-haere/geo/ch';
import {
  MAX_ZUG_PX,
  nöieWind,
  streuigSigma,
  vorschau,
  zieheHang,
  zugZieu,
} from '@/lib/wo-haere/throw/mechanics';
import { mulberry32, type Rand } from '@/lib/wo-haere/throw/rng';

/**
 * The σ calibration, measured rather than asserted from a comment.
 *
 * The geometry mirrors the app: a 1280×800 map, so `brettRadius` is
 * min(1280, 800) / 2 = 400 (Wurfsteuerig.tsx), with `CH_BOUNDS` fitted into it
 * at `padding: 24` (Wandcharte.tsx). That fit is what turns a pixel miss into
 * kilometres and decides whether a dart left the country.
 *
 * Measured at SEED = 20260817, 50k throws per force:
 *
 *   force    σ          median miss        off Switzerland
 *     0%     60.8 px     76.0 px / 22.4 km    0.04%
 *    50%    106.4 px    135.8 px / 40.0 km    1.40%
 *   100%    152.0 px    196.7 px / 57.9 km    7.25%
 *
 * Averaged over the arm bias the pixel medians come out at 76 / 133 / 190; this
 * seed draws an arm that pulls a little, which is worth a few percent. Hence the
 * ±8% band rather than a pin.
 *
 * The case-study page publishes 24/42/61 km and 0.1%/1.6%/7.8%. Those came from
 * a run with a slightly wider map fit (~5.6% padding rather than the 3% that
 * `padding: 24` works out to), so the bands below are wide enough to hold both
 * sets of numbers. The one that matters is the upper bound at full force: an
 * earlier calibration ran to 23% off-board, and that is what this file exists
 * to catch.
 */
const SEED = 20260817;
const WÜRF = 50_000;

const VIEW = { breiti: 1280, höchi: 800 } as const;
const FITBOUNDS_PADDING = 24;
const BRETT_RADIUS = Math.min(VIEW.breiti, VIEW.höchi) / 2;

const MITTI: LatLon = {
  lat: (CH_BOUNDS.south + CH_BOUNDS.north) / 2,
  lon: (CH_BOUNDS.west + CH_BOUNDS.east) / 2,
};

const CH_BREITI_KM = distanceKm(
  { lat: MITTI.lat, lon: CH_BOUNDS.west },
  { lat: MITTI.lat, lon: CH_BOUNDS.east },
);
const CH_HÖCHI_KM = distanceKm(
  { lat: CH_BOUNDS.south, lon: MITTI.lon },
  { lat: CH_BOUNDS.north, lon: MITTI.lon },
);

/** Contain-fit, so the tighter axis sets the scale — the same as fitBounds. */
const KM_PRO_PX = Math.max(
  CH_BREITI_KM / (VIEW.breiti - 2 * FITBOUNDS_PADDING),
  CH_HÖCHI_KM / (VIEW.höchi - 2 * FITBOUNDS_PADDING),
);

const MITTI_PX = { x: VIEW.breiti / 2, y: VIEW.höchi / 2 };

/**
 * A drag that aims at the middle of the map with the given force. The travel
 * factor is private to the mechanics, so read it back off `vorschau` rather than
 * duplicating the constant.
 */
function zielsZmitts(chraft: number) {
  const delta = { x: 0, y: -chraft * MAX_ZUG_PX };
  const ohniVo = vorschau({ vo: { x: 0, y: 0 }, delta }, 'häre').ziel;

  return {
    vo: { x: MITTI_PX.x - ohniVo.x, y: MITTI_PX.y - ohniVo.y },
    delta,
  };
}

interface Mässig {
  sigma: number;
  medianPx: number;
  medianKm: number;
  dernaebeAateil: number;
}

function mäss(chraft: number, rand: Rand, würf = WÜRF): Mässig {
  const zug = zielsZmitts(chraft);
  // Drawn once, as in production — one wonky arm for the whole session.
  const hang = zieheHang(rand);
  const abwychige: number[] = [];
  let dernaebe = 0;

  for (let i = 0; i < würf; i++) {
    const { zieu } = zugZieu(zug, 'häre', nöieWind(rand), BRETT_RADIUS, {
      rand,
      hang,
    });
    if (zieu.kind !== 'pixel') throw new Error('unerwartet');

    const dx = zieu.x - MITTI_PX.x;
    const dy = zieu.y - MITTI_PX.y;
    const abwychig = Math.hypot(dx, dy);
    abwychige.push(abwychig);

    // Screen y points down, north points up.
    const richtig = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
    if (!isInChBbox(offset(MITTI, abwychig * KM_PRO_PX, richtig))) dernaebe++;
  }

  abwychige.sort((a, b) => a - b);
  const medianPx = abwychige[Math.floor(würf / 2)];

  return {
    sigma: streuigSigma(BRETT_RADIUS, chraft),
    medianPx,
    medianKm: medianPx * KM_PRO_PX,
    dernaebeAateil: dernaebe / würf,
  };
}

const rand = mulberry32(SEED);
const lob = mäss(0, rand);
const haub = mäss(0.5, rand);
const vou = mäss(1, rand);

describe('the map fit the calibration assumes', () => {
  it('matches the country the app actually draws', () => {
    expect(CH_BREITI_KM).toBeCloseTo(345.2, 0);
    expect(CH_HÖCHI_KM).toBeCloseTo(221.3, 0);
    expect(KM_PRO_PX).toBeCloseTo(0.2943, 4);
  });

  it('puts the board radius where the mechanics expect it', () => {
    expect(BRETT_RADIUS).toBe(400);
  });
});

describe('σ calibration', () => {
  it('puts σ on the beginner figure from the paper', () => {
    expect(lob.sigma).toBeCloseTo(60.8, 9);
    expect(haub.sigma).toBeCloseTo(106.4, 9);
    expect(vou.sigma).toBeCloseTo(152, 9);
  });

  it('misses by the expected number of pixels', () => {
    // Scale-free, so this is the tightest assertion available: ±8%.
    for (const [gmässe, erwartet] of [
      [lob.medianPx, 76],
      [haub.medianPx, 133],
      [vou.medianPx, 190],
    ]) {
      expect(gmässe / erwartet).toBeGreaterThan(0.92);
      expect(gmässe / erwartet).toBeLessThan(1.08);
    }
  });

  it('misses by roughly the published number of kilometres', () => {
    // The page says 24 / 42 / 61; the app's own map fit gives 22 / 40 / 58.
    expect(lob.medianKm).toBeGreaterThan(19);
    expect(lob.medianKm).toBeLessThan(27);
    expect(haub.medianKm).toBeGreaterThan(34);
    expect(haub.medianKm).toBeLessThan(47);
    expect(vou.medianKm).toBeGreaterThan(50);
    expect(vou.medianKm).toBeLessThan(68);
  });

  it('leaves Switzerland only occasionally', () => {
    expect(lob.dernaebeAateil).toBeLessThan(0.005);
    expect(haub.dernaebeAateil).toBeGreaterThan(0.005);
    expect(haub.dernaebeAateil).toBeLessThan(0.03);
    expect(vou.dernaebeAateil).toBeGreaterThan(0.04);
    expect(vou.dernaebeAateil).toBeLessThan(0.12);
  });

  it('never goes back to burying the player in Dernäbe cards', () => {
    // The regression this whole file exists for.
    expect(vou.dernaebeAateil).toBeLessThan(0.15);
  });

  it('gets worse with force, monotonically', () => {
    expect(haub.medianPx).toBeGreaterThan(lob.medianPx);
    expect(vou.medianPx).toBeGreaterThan(haub.medianPx);
    expect(haub.dernaebeAateil).toBeGreaterThan(lob.dernaebeAateil);
    expect(vou.dernaebeAateil).toBeGreaterThan(haub.dernaebeAateil);
  });
});

describe('reproducibility', () => {
  it('gives the same measurements twice from the same seed', () => {
    expect(mäss(1, mulberry32(1), 2000)).toEqual(mäss(1, mulberry32(1), 2000));
  });
});
