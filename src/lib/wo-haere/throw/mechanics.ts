import { CH_BOUNDS, offset, type LatLon } from '@/lib/wo-haere/geo/ch';
import { ZIU } from '@/lib/wo-haere/data/ziu';
import type { Rand } from '@/lib/wo-haere/throw/rng';

/** Where a mechanic wants the dart to land. */
export type Zieu =
  { kind: 'ort'; ort: LatLon } | { kind: 'pixel'; x: number; y: number };

/** A drag this long counts as full force. */
export const MAX_ZUG_PX = 210;

/** How far the dart travels relative to the drag. */
const FAKTOR = 2.7;

/** Ignore the first few pixels so a plain click is not a throw. */
export const MIN_ZUG_PX = 10;

/**
 * How badly a normal person misses.
 *
 * Tibshirani, Price & Taylor, "A statistician plays darts" (J. R. Statist.
 * Soc. A, 2011) model a throw as a 2-D Gaussian around the aim point and
 * measured their own accuracy over 100 throws at the bulls-eye on a board of
 * radius 170 mm:
 *
 *   σ = 64.6 mm  — author 1, not a dart player, "trying his best". He averaged
 *                  11.65 points, which is *worse* than throwing uniformly at
 *                  random over the board (12.82).
 *   σ = 26.9 mm  — author 2, "a fairly skilled darts player"
 *   σ < 20 mm    — the threshold for actually being good
 *
 * 64.6 / 170 ≈ 0.38, so a beginner's spread is nearly 40% of the target's
 * radius. That is the number this app throws with, because nobody playing this
 * is a professional. It also reproduces the paper's remark that "a beginner
 * will occasionally miss the board entirely": for a 2-D Gaussian the chance of
 * landing outside the target radius is exp(-1/(2·0.38²)) ≈ 3%.
 */
const NOVIZ_SIGMA = 0.38;

/**
 * Force makes it worse: a lob is controlled, a full-power throw is a gamble.
 * A throw at full force lands exactly on the paper's beginner figure; easing
 * off does better than that. Simulated over 120k throws on a 1280×800 view
 * (board radius 400 px, Switzerland ≈ 350 km across):
 *
 *   force   0%  σ =  61 px  median miss 24 km  off-board 0.1%
 *   force  50%  σ = 106 px  median miss 42 km  off-board 1.6%
 *   force 100%  σ = 152 px  median miss 61 km  off-board 7.8%
 *
 * The earlier calibration ran to 23% off-board at full force, which buried the
 * player in "Dernäbe!" cards — far more than the paper's "occasionally".
 */
const SIGMA_BI_CHRAFT = { min: 0.4, max: 1.0 } as const;

/**
 * Real throws are not circularly symmetric — the paper's section 3 moves to a
 * general covariance matrix for exactly this reason. Release timing shows up
 * mostly as height error, so the vertical spread is the wider one.
 */
const SIGMA_SYTLECH = 0.82;
const SIGMA_UF_AB = 1.24;

/** Beginners also shank one outright now and then. */
const CHNORZ_WAHRSCHYNLECHKEIT = 0.07;
const CHNORZ_FAKTOR = 1.9;

/** How wild the flight looked, which drives the landing animation. */
export type WurfStil = 'sufer' | 'gschlämpert' | 'chnorz';

export interface WurfErgebnis {
  zieu: Zieu;
  stil: WurfStil;
}

/**
 * A light breeze nudges every throw, so no two throws with identical input
 * land in exactly the same spot.
 */
export interface Wind {
  richtig: number;
  chraft: number;
}

export function nöieWind(rand: Rand = Math.random): Wind {
  return { richtig: rand() * 360, chraft: 0.4 + rand() * 1.8 };
}

/** Box–Muller: one draw from a standard normal. */
function normal(rand: Rand): number {
  let u = 0;
  while (u === 0) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

/** A thrower's standing tendency to pull one way, in units of σ. */
export interface Hang {
  x: number;
  y: number;
}

export function zieheHang(rand: Rand): Hang {
  return { x: normal(rand) * 0.16, y: normal(rand) * 0.16 };
}

/**
 * Everyone has a consistent tendency to pull one way. Drawn once per session so
 * it feels like *your* wonky throwing arm rather than fresh noise every time.
 */
let hang: Hang | null = null;

function myHang(): Hang {
  hang ??= zieheHang(Math.random);
  return hang;
}

/** 1σ of the miss, in pixels — also drawn on the aim overlay. */
export function streuigSigma(brettRadius: number, chraft: number): number {
  const skala =
    SIGMA_BI_CHRAFT.min + chraft * (SIGMA_BI_CHRAFT.max - SIGMA_BI_CHRAFT.min);
  return Math.max(6, brettRadius * NOVIZ_SIGMA * skala);
}

export interface Zug {
  /** Where the dart starts, in container pixels. */
  vo: { x: number; y: number };
  /** Pointer offset from the press point. */
  delta: { x: number; y: number };
}

export type ZugArt = 'zrugg' | 'häre';

export interface ZugVorschau {
  /** Predicted landing pixel. */
  ziel: { x: number; y: number };
  /** 0–1, for the power meter. */
  chraft: number;
  /** Long enough to count as a throw. */
  gnue: boolean;
}

/**
 * Turns a mouse drag into an aim and a force.
 *
 * One drag carries both: its direction points the dart and its length is the
 * force. "zrugg" pulls back like a slingshot and the dart flies the opposite
 * way; "häre" flings it along the drag instead.
 *
 * Deliberately has no randomness — the preview overlay renders this, so it has
 * to agree exactly with where the dart will go. Scatter is added at release.
 */
export function vorschau(zug: Zug, art: ZugArt): ZugVorschau {
  const { vo, delta } = zug;
  const läng = Math.hypot(delta.x, delta.y);
  const chraft = Math.min(läng / MAX_ZUG_PX, 1);

  const richtig = art === 'zrugg' ? -1 : 1;
  return {
    ziel: {
      x: vo.x + delta.x * richtig * FAKTOR,
      y: vo.y + delta.y * richtig * FAKTOR,
    },
    chraft,
    gnue: läng >= MIN_ZUG_PX,
  };
}

/** Lets a caller replay a throw — the calibration tests and debugging both need it. */
export interface WurfOptione {
  /** Where the scatter comes from. Defaults to `Math.random`. */
  rand?: Rand;
  /** The thrower's standing bias. Defaults to the once-per-session draw. */
  hang?: Hang;
}

/**
 * The actual throw: the aim from the preview, plus how much a normal person
 * misses by. The aim only ever biases the outcome — it never determines it.
 */
export function zugZieu(
  zug: Zug,
  art: ZugArt,
  wind: Wind,
  brettRadius: number,
  optione: WurfOptione = {},
): WurfErgebnis {
  const rand = optione.rand ?? Math.random;
  const { ziel, chraft } = vorschau(zug, art);

  const chnorz = rand() < CHNORZ_WAHRSCHYNLECHKEIT;
  const sigma =
    streuigSigma(brettRadius, chraft) * (chnorz ? CHNORZ_FAKTOR : 1);
  const bias = optione.hang ?? myHang();

  const abx = normal(rand) * sigma * SIGMA_SYTLECH + bias.x * sigma;
  const aby = normal(rand) * sigma * SIGMA_UF_AB + bias.y * sigma;

  const windRad = (wind.richtig * Math.PI) / 180;
  const abwychig = Math.hypot(abx, aby);

  return {
    zieu: {
      kind: 'pixel',
      x: ziel.x + abx + Math.cos(windRad) * wind.chraft * 2.5,
      y: ziel.y + aby + Math.sin(windRad) * wind.chraft * 2.5,
    },
    stil: chnorz ? 'chnorz' : abwychig > sigma * 1.15 ? 'gschlämpert' : 'sufer',
  };
}

function mitWind(ort: LatLon, wind: Wind): LatLon {
  return offset(ort, wind.chraft, wind.richtig);
}

function clampInsCh(ort: LatLon): LatLon {
  return {
    lat: Math.min(
      Math.max(ort.lat, CH_BOUNDS.south + 0.05),
      CH_BOUNDS.north - 0.05,
    ),
    lon: Math.min(
      Math.max(ort.lon, CH_BOUNDS.west + 0.05),
      CH_BOUNDS.east - 0.05,
    ),
  };
}

/**
 * Ei Tipp — one tap, pure luck.
 *
 * Mostly lands near a curated destination so a single tap gives a usable
 * answer, but a fifth of the throws go somewhere entirely random, which is
 * where the "middle of a field" jokes come from.
 */
export function tippZieu(wind: Wind, rand: Rand = Math.random): WurfErgebnis {
  const stil: WurfStil =
    rand() < CHNORZ_WAHRSCHYNLECHKEIT ? 'chnorz' : 'gschlämpert';

  if (rand() < 0.8) {
    const ziu = ZIU[Math.floor(rand() * ZIU.length)];
    const streuig = rand() * 6;
    const richtig = rand() * 360;
    const ort = offset({ lat: ziu.lat, lon: ziu.lon }, streuig, richtig);
    return { zieu: { kind: 'ort', ort: clampInsCh(mitWind(ort, wind)) }, stil };
  }

  return {
    zieu: {
      kind: 'ort',
      ort: mitWind(
        {
          lat: CH_BOUNDS.south + rand() * (CH_BOUNDS.north - CH_BOUNDS.south),
          lon: CH_BOUNDS.west + rand() * (CH_BOUNDS.east - CH_BOUNDS.west),
        },
        wind,
      ),
    },
    stil,
  };
}
