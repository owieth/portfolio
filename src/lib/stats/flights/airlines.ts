import type { Airline } from '@/lib/stats/flights/types';

/**
 * The five carriers in the log, IATA code to name and brand colour.
 *
 * **No logos.** Airline logos are registered trademarks, and every free set on
 * GitHub either carries no licence or explicitly disclaims the marks it ships —
 * including the MIT-tagged ones, where the licence covers the repository and
 * not the artwork. Airhex licenses them properly but is quote-only and a
 * runtime third-party request. A brand colour with the two-letter code set in
 * type on it infringes nothing: the code and the name are facts, and a colour
 * on its own is not protectable. It also looks deliberate rather than like a
 * missing image.
 *
 * There is no licensed dataset of airline brand colours either — brandcolors,
 * encycolorpedia and the rest are scrapes. So each hex carries where it came
 * from, the way the coordinates in `airports.ts` do. Only British Airways
 * publishes an actual palette; the other four are the airline's own design
 * token or its own artwork, which is the best provenance available.
 *
 * `onColour` is not a taste call. It is whichever of white or black clears WCAG
 * AA against the brand colour, and `airlines.test.ts` recomputes it rather than
 * trusting the value written here. KLM is the one that surprises: `#00A1DE` is
 * light enough that white text fails at 2.94:1.
 *
 * Ordered by flights in the seed, not alphabetically.
 */
export const AIRLINES = {
  LX: {
    iata: 'LX',
    name: 'Swiss',
    // SWISS publish no brand portal and swiss.com refuses non-browser clients,
    // so this is sampled from two pieces of their own artwork that agree: the
    // flat field of swiss.com/favicon.ico and of the SWISS App Store icon.
    // Their 403 page styles headings #BE1902; that reads as legacy static CSS
    // rather than the mark, which is flat #CC0000 in both assets.
    colour: '#CC0000',
    onColour: '#FFFFFF',
  },
  BA: {
    iata: 'BA',
    name: 'British Airways',
    // The only one from a published palette: British Airways Brand Guidelines
    // v1, September 2007, section 3.2 "Core colour palette", where #0035AD is
    // listed under "Screen safe colour HEX" beside Pantone 286C.
    colour: '#0035AD',
    onColour: '#FFFFFF',
  },
  OS: {
    iata: 'OS',
    name: 'Austrian',
    // Sampled, like SWISS, and for the same reason — austrianairlines.ag sits
    // behind a challenge. Flat across the Austrian Airlines App Store icon and
    // corroborated by austrian.com/favicon.ico, which anti-aliases to #D71E05.
    colour: '#D81E05',
    onColour: '#FFFFFF',
  },
  KL: {
    iata: 'KL',
    name: 'KLM',
    // A declared token rather than a sampled pixel: --bwc-palette-blue-kl in
    // KLM's own shipped stylesheet, from the design system Air France-KLM
    // share. The newsroom logo PNG samples #00A1E4, a hair off, which is the
    // PNG's colour profile rather than a second blue.
    colour: '#00A1DE',
    // Black, not white. White is 2.94:1 here and fails AA outright.
    onColour: '#000000',
  },
  SK: {
    iata: 'SK',
    name: 'SAS',
    // Also a declared token: --color-primary on flysas.com, hsla(240 100% 30%)
    // exactly. The SAS Group apple-touch-icon is the same value flat.
    colour: '#000099',
    onColour: '#FFFFFF',
  },
} as const satisfies Record<string, Airline>;

export type AirlineCode = keyof typeof AIRLINES;

/**
 * Null for a carrier the registry does not know, and the caller falls back to
 * the raw code rather than dropping the flight.
 *
 * This is deliberately *not* the skip-and-warn path `toLegs` takes for an
 * unknown airport. A missing airport makes a distance wrong; a missing airline
 * does not make any total wrong. The flight still happened and still counts.
 */
export const airline = (code: string): Airline | null =>
  Object.hasOwn(AIRLINES, code) ? AIRLINES[code as AirlineCode] : null;
