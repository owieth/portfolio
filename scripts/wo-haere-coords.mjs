/**
 * Verifies every curated destination against swisstopo.
 *
 *   pnpm coords:wo-haere           # check the list
 *   pnpm coords:wo-haere --update  # rewrite the elevation snapshot
 *
 * Each coordinate is run through the app's own resolveHit(), so the check
 * exercises the same Gemeinde layer and elevation API the game does. A
 * coordinate has to land in Switzerland, resolve to a municipality, and come
 * back at the elevation recorded in wo-haere-hoechi.json — a coordinate that
 * quietly moves lands on different ground, which is how a football stadium in
 * Thun stopped masquerading as the Stockhorn summit.
 *
 * Cantons are only ever a warning: Sustepass and Vierwaudstättersee sit on
 * cantonal borders, so the Gemeinde underneath is a judgement call.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { registerAlias } from './lib/ts-alias.mjs';

registerAlias();

const { ZIU } = await import('@/lib/wo-haere/data/ziu');
const { isInChBbox } = await import('@/lib/wo-haere/geo/ch');
const { resolveHit } = await import('@/lib/wo-haere/geo/resolveHit');

const SNAPSHOT = new URL('./wo-haere-hoechi.json', import.meta.url);

/** swisstopo's terrain model is stable; this is slack for a rounding change. */
const TOLERANZ_M = 25;

/** Polite enough for 186 destinations. */
const GLYCHZYTIG = 6;

const update = process.argv.includes('--update');

async function pruef(ziu) {
  if (!isInChBbox(ziu)) return { ziu, hart: 'USSERHALB DR SCHWYZ' };

  try {
    const wurf = await resolveHit({ lat: ziu.lat, lon: ziu.lon });
    if (wurf.art === 'dernaebe')
      return { ziu, hart: `DERNÄBE (${wurf.grund})` };
    if (wurf.hoechi === null) return { ziu, hart: 'KEI HÖCHI' };
    return { ziu, wurf };
  } catch (error) {
    return { ziu, hart: `FEHLER ${error.message}` };
  }
}

const resultat = [];
for (let i = 0; i < ZIU.length; i += GLYCHZYTIG) {
  resultat.push(
    ...(await Promise.all(ZIU.slice(i, i + GLYCHZYTIG).map(pruef))),
  );
}

const name = ziu => ziu.name.padEnd(22);

if (update) {
  const kaputt = resultat.filter(r => r.hart);
  for (const r of kaputt) console.error(`${name(r.ziu)} ${r.hart}`);

  if (kaputt.length > 0) {
    console.error(
      `\n${kaputt.length} Ziu la sech nid ufflöse — Snapshot nid gschriebe.`,
    );
    process.exit(1);
  }

  const hoechi = Object.fromEntries(
    resultat
      .map(r => [r.ziu.name, r.wurf.hoechi])
      .sort(([a], [b]) => a.localeCompare(b, 'de-CH')),
  );
  await writeFile(SNAPSHOT, `${JSON.stringify(hoechi, null, 2)}\n`);

  console.log(
    `${resultat.length} Höchi gschriebe: scripts/wo-haere-hoechi.json`,
  );
  process.exit(0);
}

const erwartet = JSON.parse(await readFile(SNAPSHOT, 'utf8'));

let fehler = 0;
let z_luege = 0;

for (const { ziu, wurf, hart } of resultat) {
  if (hart) {
    console.error(`${name(ziu)} ${hart}`);
    fehler++;
    continue;
  }

  const soll = erwartet[ziu.name];
  if (soll === undefined) {
    console.error(`${name(ziu)} NÖI IM ZIU — lauf mit --update`);
    fehler++;
    continue;
  }

  const delta = wurf.hoechi - soll;
  if (Math.abs(delta) > TOLERANZ_M) {
    const vorzeiche = delta > 0 ? '+' : '';
    console.error(
      `${name(ziu)} HÖCHI ${wurf.hoechi} m statt ${soll} m (${vorzeiche}${delta})`,
    );
    fehler++;
    continue;
  }

  const notiz = [];
  if (!wurf.kanton.includes(ziu.kanton)) {
    notiz.push(`Kanton ${wurf.kanton || '?'} statt ${ziu.kanton}`);
  }
  if ((ziu.art === 'stadt' || ziu.art === 'dörfli') && wurf.wasser) {
    notiz.push('im Wasser');
  }
  if (notiz.length > 0) z_luege++;

  console.log(
    `${name(ziu)} ${String(wurf.hoechi).padStart(5)} m  ${wurf.gmeind}` +
      (notiz.length > 0 ? `  — ${notiz.join(', ')}` : ''),
  );
}

for (const gspeicheret of Object.keys(erwartet)) {
  if (!ZIU.some(ziu => ziu.name === gspeicheret)) {
    console.error(`${gspeicheret.padEnd(22)} NÜMME IM ZIU — lauf mit --update`);
    fehler++;
  }
}

console.log(
  `\n${ZIU.length - fehler}/${ZIU.length} Ziu prüeft, ${z_luege} z luege`,
);
process.exit(fehler === 0 ? 0 : 1);
