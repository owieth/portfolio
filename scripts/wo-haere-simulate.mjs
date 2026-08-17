/**
 * Reproduces the throw calibration table published in
 * src/lib/wo-haere/throw/mechanics.ts and on the project page.
 *
 *   pnpm simulate:wo-haere                 # the published run
 *   pnpm simulate:wo-haere --seed=7        # a different draw
 *   pnpm simulate:wo-haere --throws=10000  # a quick one
 *
 * Every throw goes through the shipped zugZieu(), so the table is measured on
 * the constants the game actually uses. Change NOVIZ_SIGMA or SIGMA_BI_CHRAFT
 * and the numbers here move with them.
 *
 * The app draws its scatter from Math.random, so seeding that is enough to
 * make a run reproducible without the mechanics knowing anything about it.
 */

import { registerAlias } from './lib/ts-alias.mjs';

registerAlias();

const { CH_BOUNDS, distanceKm } = await import('@/lib/wo-haere/geo/ch');

function flag(name, fallback) {
  const hit = process.argv.slice(2).find(a => a.startsWith(`--${name}=`));
  return hit ? Number(hit.slice(name.length + 3)) : fallback;
}

const SEED = flag('seed', 20240101);

/**
 * 120k throws leaves the full-force row moving by a kilometre and two tenths
 * of a point between seeds, which is more than the table's own precision.
 */
const WUERF = flag('throws', 1_200_000);

/** The force levels the published table reports. */
const CHREFT = [0, 0.5, 1];

/** The view the table is measured on. */
const SICHT = { breiti: 1280, hööchi: 800 };

/** Wandcharte fits Switzerland into the map with this much room to spare. */
const PADDING = 24;

/** Wurfsteuerig takes the board radius from the map container. */
const BRETT_RADIUS = Math.min(SICHT.breiti, SICHT.hööchi) / 2;

/**
 * The shooting bias is drawn once per module instance and stands for one
 * player's wonky arm, so a run needs many instances to describe a population
 * rather than a single thrower. It is the number of arms, not the number of
 * throws, that settles the off-board tail. Re-importing is most of the run
 * time, so this trades a few thousand arms against a script that finishes.
 */
const PRO_SESSION = flag('session', 400);
const SESSIONE = Math.max(1, Math.round(WUERF / PRO_SESSION));

/** mulberry32. */
function seedle(seed) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

Math.random = seedle(SEED);

/**
 * MapLibre's Web Mercator, headless: normalised world coordinates in [0,1],
 * then the fitBounds scale at which CH_BOUNDS fills the padded view. Only the
 * inverse is needed — a landing pixel has to become a coordinate before the
 * miss can be measured in kilometres.
 */
const weltX = lon => (lon + 180) / 360;
const weltY = lat =>
  0.5 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / (2 * Math.PI);

const spann = {
  x: weltX(CH_BOUNDS.east) - weltX(CH_BOUNDS.west),
  y: weltY(CH_BOUNDS.south) - weltY(CH_BOUNDS.north),
};

const WELT_PX = Math.min(
  (SICHT.breiti - 2 * PADDING) / spann.x,
  (SICHT.hööchi - 2 * PADDING) / spann.y,
);

const MITTI = {
  x: (weltX(CH_BOUNDS.west) + weltX(CH_BOUNDS.east)) / 2,
  y: (weltY(CH_BOUNDS.north) + weltY(CH_BOUNDS.south)) / 2,
};

function zumOrt(px, py) {
  const x = MITTI.x + (px - SICHT.breiti / 2) / WELT_PX;
  const y = MITTI.y + (py - SICHT.hööchi / 2) / WELT_PX;
  return {
    lon: x * 360 - 180,
    lat:
      ((Math.atan(Math.exp((0.5 - y) * 2 * Math.PI)) - Math.PI / 4) * 360) /
      Math.PI,
  };
}

/** Everyone aims at the middle of the board. */
const ZIEL = { x: SICHT.breiti / 2, y: SICHT.hööchi / 2 };
const ZIEL_ORT = zumOrt(ZIEL.x, ZIEL.y);

function median(sortiert) {
  const n = sortiert.length;
  return (sortiert[(n - 1) >> 1] + sortiert[n >> 1]) / 2;
}

/**
 * A drag whose length carries the force and whose aim lands on the board
 * centre. The flight distance is solved through vorschau() from a zero origin
 * rather than copied out of mechanics, so the private throw factor stays
 * private.
 */
function zugUfsZiel(mech, chraft) {
  const delta = { x: chraft * mech.MAX_ZUG_PX, y: 0 };
  const { ziel: flug } = mech.vorschau({ vo: { x: 0, y: 0 }, delta }, 'häre');
  return { vo: { x: ZIEL.x - flug.x, y: ZIEL.y - flug.y }, delta };
}

async function simuliere(chraft) {
  const missKm = [];
  let abBrett = 0;
  let sigma = 0;

  for (let session = 0; session < SESSIONE; session++) {
    const mech = await import(
      `@/lib/wo-haere/throw/mechanics?session=${chraft}-${session}`
    );
    const zug = zugUfsZiel(mech, chraft);
    sigma = mech.streuigSigma(BRETT_RADIUS, chraft);

    for (let i = 0; i < PRO_SESSION; i++) {
      const { zieu } = mech.zugZieu(zug, 'häre', mech.nöieWind(), BRETT_RADIUS);
      if (Math.hypot(zieu.x - ZIEL.x, zieu.y - ZIEL.y) > BRETT_RADIUS)
        abBrett++;
      missKm.push(distanceKm(ZIEL_ORT, zumOrt(zieu.x, zieu.y)));
    }
  }

  missKm.sort((a, b) => a - b);
  return {
    chraft,
    sigma,
    missKm: median(missKm),
    abBrett: (100 * abBrett) / missKm.length,
  };
}

const zeile = (a, b, c, d) =>
  `${a.padStart(6)}  ${b.padStart(7)}  ${c.padStart(12)}  ${d.padStart(14)}`;

console.log(zeile('Force', 'σ', 'Median miss', 'Off the board'));

for (const chraft of CHREFT) {
  const r = await simuliere(chraft);
  console.log(
    zeile(
      `${Math.round(r.chraft * 100)}%`,
      `${Math.round(r.sigma)} px`,
      `${Math.round(r.missKm)} km`,
      `${r.abBrett.toFixed(1)}%`,
    ),
  );
}

/** At the centre of the view, where the aim point sits. */
const kmProPx =
  (2 * Math.PI * 6371 * Math.cos((ZIEL_ORT.lat * Math.PI) / 180)) / WELT_PX;

console.log(
  `\n${(SESSIONE * PRO_SESSION).toLocaleString('en')} throws per force level, ` +
    `${SESSIONE} sessions of ${PRO_SESSION} · seed ${SEED}`,
);
console.log(
  `${SICHT.breiti}×${SICHT.hööchi} view, board radius ${BRETT_RADIUS} px · ` +
    `${kmProPx.toFixed(3)} km/px at the aim point`,
);
console.log(
  'A fixed seed repeats exactly; across seeds the last digit of the median ' +
    'moves by about 0.5 km and the off-board rate by about 0.1 points.',
);
