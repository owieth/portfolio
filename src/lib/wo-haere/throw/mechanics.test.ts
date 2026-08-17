import { afterEach, describe, expect, it, vi } from 'vitest';

import { CH_BOUNDS, distanceKm, isInChBbox } from '@/lib/wo-haere/geo/ch';
import { ZIU } from '@/lib/wo-haere/data/ziu';
import {
  MAX_ZUG_PX,
  MIN_ZUG_PX,
  nöieWind,
  streuigSigma,
  tippZieu,
  vorschau,
  zieheHang,
  zugZieu,
  type Wind,
  type Zug,
} from '@/lib/wo-haere/throw/mechanics';
import { mulberry32 } from '@/lib/wo-haere/throw/rng';

const KEI_HANG = { x: 0, y: 0 };
const WIND: Wind = { richtig: 0, chraft: 0 };

const zug = (dx: number, dy: number): Zug => ({
  vo: { x: 100, y: 100 },
  delta: { x: dx, y: dy },
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('vorschau', () => {
  it('returns the same thing twice for the same drag', () => {
    const eis = vorschau(zug(60, -40), 'häre');
    const zwöi = vorschau(zug(60, -40), 'häre');

    expect(eis).toEqual(zwöi);
  });

  it('never touches Math.random', () => {
    // The overlay renders this, so it has to agree exactly with where the dart
    // goes. If someone reintroduces randomness here, the aim circle starts lying.
    vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('vorschau muess ohni Zuefau uuschoo');
    });

    expect(() => vorschau(zug(60, -40), 'häre')).not.toThrow();
    expect(() => vorschau(zug(60, -40), 'zrugg')).not.toThrow();
  });

  it('flings the dart along the drag for häre', () => {
    const { ziel } = vorschau(zug(50, 20), 'häre');

    expect(ziel.x).toBeGreaterThan(100);
    expect(ziel.y).toBeGreaterThan(100);
  });

  it('slingshots the dart the other way for zrugg', () => {
    const häre = vorschau(zug(50, 20), 'häre');
    const zrugg = vorschau(zug(50, 20), 'zrugg');

    expect(zrugg.ziel.x - 100).toBeCloseTo(-(häre.ziel.x - 100), 9);
    expect(zrugg.ziel.y - 100).toBeCloseTo(-(häre.ziel.y - 100), 9);
  });

  it('reads force off the drag length and clamps it at full', () => {
    expect(vorschau(zug(0, 0), 'häre').chraft).toBe(0);
    expect(vorschau(zug(MAX_ZUG_PX / 2, 0), 'häre').chraft).toBeCloseTo(0.5, 9);
    expect(vorschau(zug(MAX_ZUG_PX, 0), 'häre').chraft).toBe(1);
    expect(vorschau(zug(MAX_ZUG_PX * 3, 0), 'häre').chraft).toBe(1);
  });

  it('counts a drag of exactly MIN_ZUG_PX as a throw', () => {
    expect(vorschau(zug(MIN_ZUG_PX, 0), 'häre').gnue).toBe(true);
    expect(vorschau(zug(MIN_ZUG_PX - 0.001, 0), 'häre').gnue).toBe(false);
    expect(vorschau(zug(0, 0), 'häre').gnue).toBe(false);
  });
});

describe('streuigSigma', () => {
  it('lands on the beginner figure from the paper at full force', () => {
    // 400 px board radius x 0.38 — the σ/R ratio Tibshirani, Price & Taylor
    // measured for a non-player. These three are the case-study table.
    expect(streuigSigma(400, 0)).toBeCloseTo(60.8, 9);
    expect(streuigSigma(400, 0.5)).toBeCloseTo(106.4, 9);
    expect(streuigSigma(400, 1)).toBeCloseTo(152, 9);
  });

  it('grows linearly with force', () => {
    const [a, b, c] = [0, 0.25, 0.5].map(chraft => streuigSigma(400, chraft));

    expect(b - a).toBeCloseTo(c - b, 9);
  });

  it('is monotone in both arguments', () => {
    expect(streuigSigma(400, 0.9)).toBeGreaterThan(streuigSigma(400, 0.1));
    expect(streuigSigma(500, 0.5)).toBeGreaterThan(streuigSigma(400, 0.5));
  });

  it('keeps a floor so a tiny map still scatters', () => {
    expect(streuigSigma(1, 0)).toBe(6);
    expect(streuigSigma(0, 1)).toBe(6);
  });
});

describe('nöieWind', () => {
  it('stays inside its documented range', () => {
    const rand = mulberry32(7);

    for (let i = 0; i < 2000; i++) {
      const wind = nöieWind(rand);

      expect(wind.richtig).toBeGreaterThanOrEqual(0);
      expect(wind.richtig).toBeLessThan(360);
      expect(wind.chraft).toBeGreaterThanOrEqual(0.4);
      expect(wind.chraft).toBeLessThan(2.2);
    }
  });

  it('draws from the source it is given', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('nöieWind sött de übergäbne Zuefau bruuche');
    });

    expect(() => nöieWind(mulberry32(1))).not.toThrow();
  });
});

describe('zugZieu', () => {
  const wirf = (seed: number) =>
    zugZieu(zug(0, -MAX_ZUG_PX), 'häre', WIND, 400, {
      rand: mulberry32(seed),
      hang: KEI_HANG,
    });

  it('replays exactly from the same seed', () => {
    expect(wirf(42)).toEqual(wirf(42));
  });

  it('goes somewhere else with a different seed', () => {
    expect(wirf(42)).not.toEqual(wirf(43));
  });

  it('draws from the source it is given', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('zugZieu sött de übergäbne Zuefau bruuche');
    });

    expect(() => wirf(1)).not.toThrow();
  });

  it('always lands in pixel space with a known style', () => {
    const rand = mulberry32(11);
    const hang = zieheHang(rand);

    for (let i = 0; i < 500; i++) {
      const { zieu, stil } = zugZieu(zug(0, -120), 'häre', WIND, 400, {
        rand,
        hang,
      });

      expect(zieu.kind).toBe('pixel');
      expect(['sufer', 'gschlämpert', 'chnorz']).toContain(stil);
    }
  });

  it('shanks about 7% of throws', () => {
    const rand = mulberry32(99);
    const hang = zieheHang(rand);
    let chnorz = 0;
    const n = 40_000;

    for (let i = 0; i < n; i++) {
      if (
        zugZieu(zug(0, -120), 'häre', WIND, 400, { rand, hang }).stil ===
        'chnorz'
      ) {
        chnorz++;
      }
    }

    expect(chnorz / n).toBeGreaterThan(0.06);
    expect(chnorz / n).toBeLessThan(0.08);
  });

  it('scatters wider at full force than at a lob', () => {
    const streuig = (chraft: number) => {
      const rand = mulberry32(5);
      const zieluPx = chraft * MAX_ZUG_PX;
      let summe = 0;
      const n = 4000;

      for (let i = 0; i < n; i++) {
        const { zieu } = zugZieu(zug(0, -zieluPx), 'häre', WIND, 400, {
          rand,
          hang: KEI_HANG,
        });
        const { ziel } = vorschau(zug(0, -zieluPx), 'häre');
        if (zieu.kind !== 'pixel') throw new Error('unerwartet');
        summe += Math.hypot(zieu.x - ziel.x, zieu.y - ziel.y) ** 2;
      }

      return Math.sqrt(summe / n);
    };

    expect(streuig(1)).toBeGreaterThan(streuig(0.5));
    expect(streuig(0.5)).toBeGreaterThan(streuig(0));
  });

  it('lets the aim bias the throw without determining it', () => {
    const rand = mulberry32(3);
    const hang = zieheHang(rand);
    const linggs = { x: 0, y: 0 };
    const n = 3000;

    for (let i = 0; i < n; i++) {
      const { zieu } = zugZieu(zug(-80, 0), 'häre', WIND, 400, { rand, hang });
      if (zieu.kind !== 'pixel') throw new Error('unerwartet');
      linggs.x += zieu.x / n;
      linggs.y += zieu.y / n;
    }

    // Dragging left aims left of the start point, on average.
    expect(linggs.x).toBeLessThan(100);
  });

  it('carries the throw downwind', () => {
    const ohni = zugZieu(zug(0, -120), 'häre', { richtig: 0, chraft: 0 }, 400, {
      rand: mulberry32(8),
      hang: KEI_HANG,
    });
    const mit = zugZieu(zug(0, -120), 'häre', { richtig: 0, chraft: 2 }, 400, {
      rand: mulberry32(8),
      hang: KEI_HANG,
    });

    if (ohni.zieu.kind !== 'pixel' || mit.zieu.kind !== 'pixel') {
      throw new Error('unerwartet');
    }

    // Bearing 0 pushes along +x, since the wind is applied in pixel space.
    expect(mit.zieu.x).toBeGreaterThan(ohni.zieu.x);
  });
});

describe('tippZieu', () => {
  it('replays exactly from the same seed', () => {
    expect(tippZieu(WIND, mulberry32(4))).toEqual(
      tippZieu(WIND, mulberry32(4)),
    );
  });

  it('draws from the source it is given', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('tippZieu sött de übergäbne Zuefau bruuche');
    });

    expect(() => tippZieu(WIND, mulberry32(1))).not.toThrow();
  });

  it('always answers with a coordinate, never a pixel', () => {
    const rand = mulberry32(21);

    for (let i = 0; i < 2000; i++) {
      expect(tippZieu(nöieWind(rand), rand).zieu.kind).toBe('ort');
    }
  });

  it('sends about four fifths of throws to a curated destination', () => {
    const rand = mulberry32(13);
    let nöch = 0;
    const n = 20_000;

    for (let i = 0; i < n; i++) {
      const { zieu } = tippZieu(nöieWind(rand), rand);
      if (zieu.kind !== 'ort') throw new Error('unerwartet');

      // 6 km of scatter plus at most 2.2 km of wind.
      const nöchscht = Math.min(
        ...ZIU.map(ziu => distanceKm(zieu.ort, { lat: ziu.lat, lon: ziu.lon })),
      );
      if (nöchscht <= 8.2) nöch++;
    }

    expect(nöch / n).toBeGreaterThan(0.8);
  });

  it('keeps almost every throw inside the country under a real breeze', () => {
    const rand = mulberry32(17);
    let dinne = 0;
    const n = 5000;

    for (let i = 0; i < n; i++) {
      const { zieu } = tippZieu(nöieWind(rand), rand);
      if (zieu.kind !== 'ort') throw new Error('unerwartet');
      if (isInChBbox(zieu.ort)) dinne++;
    }

    expect(dinne / n).toBeGreaterThan(0.95);
  });

  it('clamps the curated branch but lets the uniform fifth drift', () => {
    // A 500 km gale is absurd, but the clamp is private and this is the only door
    // to it: it pushes every throw far past the border, so anything that comes
    // back inside came back because it was clamped. Only the curated branch is.
    const rand = mulberry32(29);
    const stürm: Wind = { richtig: 0, chraft: 500 };
    let dinne = 0;
    const n = 3000;

    for (let i = 0; i < n; i++) {
      const { zieu } = tippZieu(stürm, rand);
      if (zieu.kind !== 'ort') throw new Error('unerwartet');
      if (isInChBbox(zieu.ort)) dinne++;
    }

    // The 80% curated share is pulled back; the 20% uniform share is not.
    expect(dinne / n).toBeGreaterThan(0.75);
    expect(dinne / n).toBeLessThan(0.85);
  });

  it('never clamps to the very edge of the bounding box', () => {
    const rand = mulberry32(23);

    for (let i = 0; i < 3000; i++) {
      const { zieu } = tippZieu(nöieWind(rand), rand);
      if (zieu.kind !== 'ort') throw new Error('unerwartet');

      expect(zieu.ort.lat).toBeGreaterThan(CH_BOUNDS.south - 1);
      expect(zieu.ort.lat).toBeLessThan(CH_BOUNDS.north + 1);
      expect(zieu.ort.lon).toBeGreaterThan(CH_BOUNDS.west - 1);
      expect(zieu.ort.lon).toBeLessThan(CH_BOUNDS.east + 1);
    }
  });
});

describe('zieheHang', () => {
  it('replays from the same seed', () => {
    expect(zieheHang(mulberry32(2))).toEqual(zieheHang(mulberry32(2)));
  });

  it('stays a small nudge rather than a systematic miss', () => {
    const rand = mulberry32(31);
    let summe = 0;
    const n = 20_000;

    for (let i = 0; i < n; i++) {
      const hang = zieheHang(rand);
      summe += hang.x ** 2 + hang.y ** 2;
    }

    // 0.16σ per axis, so the RMS over both axes is 0.16·√2.
    expect(Math.sqrt(summe / n)).toBeCloseTo(0.16 * Math.SQRT2, 2);
  });
});
