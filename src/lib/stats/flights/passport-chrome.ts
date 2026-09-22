/**
 * The two pieces of passport furniture on the share card that carry no data:
 * the security print along the top, and the chip on the bio page.
 *
 * Both are SVG strings rather than JSX, for the same reason the map is — a
 * string is a pure function's return value, and `passport-chrome.test.ts` can
 * read it. Satori takes them as `<img>` data URIs.
 *
 * Neither is a copy of Flighty's. Theirs runs a pastel gradient across the
 * strip and makes the chip holographic; this one is a single accent at stepped
 * opacities and a flat chip, because the gradient and the holography are the
 * parts that are specifically theirs, and because the site does not use
 * gradients anywhere else.
 */

/** The same green the globe draws its routes in, on /stats. */
const ACCENT = '#71BC92';

/** Slightly off the card's black, so a panel reads as a panel. */
const GROUND = '#0B0B0B';

/**
 * A plane from above, nose right, drawn in a 24×24 box.
 *
 * Hand-drawn: a lifted glyph would be someone's typeface or icon set, and this
 * is fifteen line segments. Symmetric about y=12 by construction — the wings
 * and tailplane are the same four points mirrored, which is what keeps it from
 * looking subtly bent at 18px.
 */
export const PLANE_GLYPH_PATH =
  'M23 12L14 13L9 21L7.5 21L11 13.8L4 14L2 17.5L1 17.5L1.6 13L1 12L1.6 11L1 6.5L2 6.5L4 10L11 10.2L7.5 3L9 3L14 11Z';

/** How far apart the planes sit, as a multiple of a plane's own width — so a
 *  strip drawn at any height keeps the same rhythm instead of overlapping. */
const PITCH_RATIO = 1.7;

const GLYPH_BOX = 24;

/**
 * Cycled rather than randomised, so the strip is identical on every render and
 * the test can count on it. Six steps is long enough that the repeat does not
 * read as a pattern across the width of the card.
 */
const OPACITIES = [0.2, 0.32, 0.45, 0.55, 0.42, 0.28];

/**
 * Where the nth plane sits, so a caller laying something over the strip can
 * cover whole glyphs rather than slice one in half.
 */
export const planePitch = (height: number): number =>
  height * 0.5 * PITCH_RATIO;

/**
 * The repeating print across the top of the card.
 *
 * The home airport interruptions are not in here: satori rasterises this
 * through resvg, which has no font of its own, so any `<text>` would come back
 * blank. The card lays the two labels over the strip instead.
 */
export function securityStripSvg(width: number, height: number): string {
  const scale = (height * 0.5) / GLYPH_BOX;
  const glyphWidth = GLYPH_BOX * scale;
  const pitch = planePitch(height);
  const top = (height - glyphWidth) / 2;

  const planes = Array.from(
    { length: Math.ceil(width / pitch) },
    (_, index) =>
      `<g transform="translate(${index * pitch} ${top}) scale(${scale})"><path d="${PLANE_GLYPH_PATH}" fill="${ACCENT}" fill-opacity="${OPACITIES[index % OPACITIES.length]}"/></g>`,
  ).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${GROUND}"/>${planes}</svg>`;
}

/**
 * The circular arrow that sits beside the home airport code, the way a
 * passport's repeating print breaks for a national emblem. Two arcs and a
 * triangle: a full circle with a bite out of it, and a head on one end.
 */
export function circularArrowSvg(size: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-3.2-6.4" fill="none" stroke="${ACCENT}" stroke-opacity="0.75" stroke-width="2.4" stroke-linecap="round"/><path d="M20.4 2.6L20.4 8.2L14.8 8.2Z" fill="${ACCENT}" fill-opacity="0.75"/></svg>`;
}

/**
 * Where a biometric passport keeps its chip.
 *
 * The contact pads are the shape that makes it legible as a chip — an outline
 * and a plane on its own would read as a badge. Flat fill and a hairline
 * stroke, no gloss: the holographic treatment is Flighty's, and a glow is not
 * an affordance this card has any use for.
 */
export function chipSvg(width: number, height: number): string {
  const pad = `stroke="${ACCENT}" stroke-opacity="0.55" stroke-width="1.4" stroke-linecap="round"`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 46 36"><rect x="0.8" y="0.8" width="44.4" height="34.4" rx="5" fill="${ACCENT}" fill-opacity="0.14" stroke="${ACCENT}" stroke-opacity="0.55" stroke-width="1.5"/><rect x="15" y="10" width="16" height="16" rx="3" fill="none" ${pad}/><path d="M1.5 13.5L15 13.5M1.5 22.5L15 22.5M31 13.5L44.5 13.5M31 22.5L44.5 22.5M19 1.5L19 10M27 1.5L27 10M19 26L19 34.5M27 26L27 34.5" fill="none" ${pad}/><g transform="translate(17 12) scale(0.5)"><path d="${PLANE_GLYPH_PATH}" fill="${ACCENT}"/></g></svg>`;
}

export const dataUri = (svg: string): string =>
  `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
