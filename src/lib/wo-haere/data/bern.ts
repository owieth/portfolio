/**
 * Every string the user sees lives here, in Berndeutsch.
 *
 * Spellings follow berndeutsch.ch. Words were checked against
 * https://www.berndeutsch.ch/search?q=<word> — scripts/wo-haere-vocab.mjs
 * re-runs that check. Notable results from the first pass:
 *   schmeisse = werfen · preiche = ein Ziel treffen · dernäbe = daneben
 *   "träffer", "stäigyse" and "badhösli" are NOT in the dictionary — avoided.
 */

export const APP = {
  name: 'Wo häre?',
  tagline: "Schmeiss e Pfyl u lue, wo's di häre nimmt.",
  beschrybig:
    'Ds Pfyl entscheidet, wohi dr nächscht Uusflug geit. Charte a d Wand, Pfyl i d Hand.',
} as const;

export const AKTIONE = {
  schmeisse: 'Schmeiss de Pfyl!',
  nomau: 'Nomau!',
  teile: 'Teile',
  gteilt: 'Gteilt!',
  kopiert: 'Link kopiert!',
  nidTeilt: 'Het nid klappet',
  ufDCharte: 'Uf d Charte',
  zrugg: 'Zrügg',
  zue: 'Zue',
  ladet: 'Ds Pfyl flügt…',
  loslah: 'Lah los!',
  tippMi: 'Tipp uf d Charte',
} as const;

export const YSCHTELLIGE = {
  titu: 'Yschtellige',
  aasicht: 'Aasicht',
  wurfart: 'Wurfart',
  ton: 'Ton',
  tonA: 'Ton a',
  tonUs: 'Ton us',
  pfylsorte: 'Pfyl-Sorte',
} as const;

export const AASICHTE = {
  charte: { name: 'Charte', hiuf: 'D Landeskarte a der Wand' },
  chugele: { name: 'Wäutchugele', hiuf: 'D ganzi Wäut aus Chugele' },
  aaflug: { name: 'Aaflug', hiuf: 'Vo der Chugele abe i d Schwyz' },
} as const;

export const WURFARTE = {
  zieh: { name: 'Zieh', hiuf: 'Ds Pfyl zrügg zieh, ziue u lah los' },
  tipp: { name: 'Ei Tipp', hiuf: 'Ei Tipp u ds Schicksau entscheidet' },
  schlüder: {
    name: 'Schlüder',
    hiuf: 'Ds Pfyl dert häre schlüdere, wo du wottsch',
  },
} as const;

export const RESULTAT = {
  duGaschUf: 'Du gasch uf',
  duLandischIm: 'Du landisch im',
  kanton: 'Kanton',
  ueberMeer: 'm ü. M.',
  voBaern: 'vo Bärn',
  wasMachsch: 'Was machsch dert?',
  preicht: 'Preicht!',
  gnauUfsZiu: 'Gnau ufs Ziu — das git e Chueglogge!',
} as const;

export const DERNAEBE = {
  titu: 'Dernäbe!',
  usland: 'Ds Pfyl isch us der Schwyz gfloge. Das zäut nid — nomau!',
  grenzwasser:
    'Du bisch im Wasser a der Gränze gladet. Nid ganz Schwyz, nid ganz nid. Nomau!',
  nid_uf_der_charte:
    'Ds Pfyl isch a der Wand gladet u nid uf der Charte. Ds Loch zahlsch du. Nomau!',
} as const;

export const WURFBUECH = {
  titu: 'Wurfbuech',
  leer: 'No kei Pfyl gschmisse. Fang a!',
  leere: 'Wurfbuech leere',
  sicher: 'Sicher?',
  sicherText: 'Aui Würf u Stämpfel si när wäg. Das cha me nid zrügghole.',
  jaLeere: 'Ja, leere',
  wuerf: (n: number) => (n === 1 ? '1 Wurf' : `${n} Würf`),
} as const;

export const STAEMPFEL = {
  titu: 'Stämpfelcharte',
  hiuf: "Für jede Kanton, wo du preicht hesch, git's e Stämpfel.",
  gsammlet: (n: number) => `${n} vo 26 Kantön`,
  auiGsammlet: 'Aui 26 Kantön! Du hesch d ganzi Schwyz preicht.',
} as const;

export const FAEHLER = {
  titu: 'Öppis isch schiefgloffe',
  swisstopo: "swisstopo git grad nid Antwort. Probier's nomau.",
  nomauProbiere: 'Nomau probiere',
} as const;

/** Canton abbreviations to Berndeutsch names. */
export const KANTOEN: Record<string, string> = {
  AG: 'Aargou',
  AI: 'Appezöu Innerrhode',
  AR: 'Appezöu Usserrhode',
  BE: 'Bärn',
  BL: 'Basu-Landschaft',
  BS: 'Basu-Stadt',
  FR: 'Fryburg',
  GE: 'Gänf',
  GL: 'Glarus',
  GR: 'Graubünde',
  JU: 'Jura',
  LU: 'Luzärn',
  NE: 'Neuenburg',
  NW: 'Nidwaude',
  OW: 'Obwaude',
  SG: 'Sanggale',
  SH: 'Schaffhuuse',
  SO: 'Soledurn',
  SZ: 'Schwyz',
  TG: 'Thurgou',
  TI: 'Tessin',
  UR: 'Uri',
  VD: 'Waadt',
  VS: 'Wallis',
  ZG: 'Zug',
  ZH: 'Züri',
};

export const AUI_KANTOEN = Object.keys(KANTOEN);

export function kantonsName(abbr: string): string {
  return KANTOEN[abbr] ?? abbr;
}

/** Dart skins, unlocked by how many throws are in the Wurfbuech. */
export const PFYLSORTE = [
  { id: 'pfyl', name: 'Normaus Pfyl', abNWuerf: 0, emoji: '🎯' },
  { id: 'zahnstoecher', name: 'Zahnstocher', abNWuerf: 5, emoji: '🪥' },
  { id: 'chaesmaesser', name: 'Chäsmässer', abNWuerf: 15, emoji: '🧀' },
  { id: 'alphorn', name: 'Alphornspitz', abNWuerf: 30, emoji: '📯' },
] as const;

export type PfylsorteId = (typeof PFYLSORTE)[number]['id'];

export const ATTRIBUTION = {
  swisstopo: '© swisstopo',
  osm: '© OpenFreeMap · © OpenStreetMap',
} as const;
