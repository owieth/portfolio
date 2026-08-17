/**
 * A source of uniform numbers in [0, 1) — the same contract as `Math.random`.
 *
 * The throw mechanics take one of these instead of reaching for `Math.random`
 * directly, so a run can be replayed: the calibration tests need it to measure
 * the σ bands, and it makes a surprising throw reproducible while debugging.
 */
export type Rand = () => number;

/**
 * mulberry32 — 32 bits of state, one multiply-shift round per draw.
 *
 * Not cryptographic and not meant to be. It passes gjrand's smallcrush, which
 * is far more than a dart needs, and it is short enough to read in one sitting.
 */
export function mulberry32(seed: number): Rand {
  let state = seed | 0;

  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
