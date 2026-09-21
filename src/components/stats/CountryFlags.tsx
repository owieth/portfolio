import { flagSrc } from '@/lib/stats/flights/flags';
import { countryVisits } from '@/lib/stats/flights/stats';
import type { FlightLeg } from '@/lib/stats/flights/types';
import Image from 'next/image';

/**
 * The countries as a row of circular flag chips beneath the globe, which is
 * where Flighty puts them. Not on the map: the map carries dots and arcs, and
 * eleven flags pinned to it would fight the tiering for attention.
 *
 * A server component. Nothing here is interactive, so none of it needs to join
 * the MapLibre chunk `FlightGlobe` already pays for.
 */

/**
 * Decorative by itself — a flag is not a country and not a language — so the
 * image carries an empty `alt` and the row puts the name beside it in text.
 *
 * `unoptimized` because the source is an SVG: the optimizer refuses those
 * without `dangerouslyAllowSVG`, and there is nothing to optimize in 185 bytes
 * of vector anyway. The browser fetches the file from `public/` directly.
 *
 * `width`/`height` are the intrinsic 3:2 the files are drawn at; `size-full`
 * overrides both, and `object-cover` is what centre-crops the 3:2 into the
 * circle rather than letterboxing it.
 */
const Flag = ({ countryCode }: { countryCode: string }) => {
  const src = flagSrc(countryCode);

  return (
    src && (
      <Image
        src={src}
        alt=""
        width={48}
        height={32}
        unoptimized
        className="size-full object-cover"
      />
    )
  );
};

const CountryFlags = ({ legs }: { legs: FlightLeg[] }) => (
  // Most flown first, not alphabetical: every other list on this page is
  // ranked, and the same endpoint count sizes the globe's dots.
  //
  // Wraps rather than scrolls. Eleven chips need two rows below ~480px and one
  // above it, which is cheaper than a scroller and its edge fade — and there is
  // no row to overflow.
  //
  // `border-foreground/20` rather than `border-line`, which is half-white in
  // dark mode and would ring every chip like a highlight. Same reason as the
  // globe wrapper.
  <ul
    aria-label="Countries flown, most visited first"
    className="mt-6 flex flex-wrap gap-2"
  >
    {countryVisits(legs).map(({ country }) => (
      <li
        key={country.code}
        className="border-foreground/20 size-8 overflow-hidden rounded-full border"
      >
        <Flag countryCode={country.code} />
        <span className="sr-only">{country.name}</span>
      </li>
    ))}
  </ul>
);

export default CountryFlags;
