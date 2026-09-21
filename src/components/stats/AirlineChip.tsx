import type { Airline } from '@/lib/stats/flights/types';

/**
 * A carrier as its brand colour with the two-letter IATA code set in type on
 * it. Not a logo, and deliberately: airline logos are registered trademarks
 * and every free set either carries no licence or disclaims the marks it
 * ships — the full argument is in the docblock of `airlines.ts`. A colour and
 * a code infringe nothing and look intentional rather than broken.
 *
 * A server component, like `CountryFlags`. Nothing here is interactive.
 *
 * The colours are inline styles rather than classes because they are data:
 * they come off the registry, and `onColour` is whichever of white or black
 * clears WCAG AA against the fill, recomputed in `airlines.test.ts`. A carrier
 * the registry does not know falls back to the two neutral tokens, which keeps
 * this branch-free — there is no conditional class string to merge.
 *
 * `aria-hidden`, because the chip is the code said a second time: every caller
 * puts the airline name (or, for an unknown carrier, the same raw code) beside
 * it in text.
 *
 * One accent per view belongs to the globe's green. Five brand colours stay
 * legible next to it only by staying this small and this contained — a chip,
 * never a row background and never a bar fill.
 */
const AirlineChip = ({
  code,
  airline,
}: {
  code: string;
  airline: Airline | null;
}) => (
  <span
    aria-hidden
    className="inline-flex h-5 w-8 shrink-0 items-center justify-center rounded font-mono text-[11px] font-medium"
    style={{
      backgroundColor: airline?.colour ?? 'var(--muted)',
      color: airline?.onColour ?? 'var(--background)',
    }}
  >
    {code}
  </span>
);

export default AirlineChip;
