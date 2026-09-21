import { haulMix } from '@/lib/stats/flights/stats';
import type { FlightLeg, HaulBandKey } from '@/lib/stats/flights/types';

/**
 * The distance bands as one proportional bar, which is the shape Flighty uses
 * for its cabin-class distribution. Three numbers would say the same thing and
 * leave the proportion to be worked out; a bar is the proportion.
 *
 * A server component, like `CountryFlags`. Nothing here is interactive, and it
 * takes the legs and derives from them itself for the same reason that one
 * does — the page has nothing else to do with the bands.
 */

/**
 * Light to dark, left to right, and deliberately the opposite way round to the
 * counts: long haul is the rarest band and therefore the narrowest slice, so it
 * gets the fill that survives being 8% of the bar. A ramp that followed the
 * counts would fade out exactly where the bar is hardest to see.
 *
 * `foreground` rather than a colour: one accent per view belongs to the globe's
 * green, and `AirlineChip` has already ruled a brand colour out of a bar fill.
 */
const FILL: Record<HaulBandKey, string> = {
  short: 'bg-foreground/30',
  medium: 'bg-foreground/60',
  long: 'bg-foreground',
};

const HaulMix = ({ legs }: { legs: FlightLeg[] }) => {
  // Empty bands are dropped from both the bar and the legend. `haulMix` returns
  // all three because a distribution has a fixed shape, but a log with no long
  // haul in it should say nothing rather than say `0` — which is the same
  // objection that ruled out Flighty's domestic/international split.
  const bands = haulMix(legs).filter(({ flights }) => flights > 0);
  const total = bands.reduce((sum, { flights }) => sum + flights, 0);

  if (total === 0) {
    return null;
  }

  return (
    <div>
      {/*
        `aria-hidden`, because the legend below is the same three numbers in
        text. A distribution is not a progress bar and has no `valuenow` to
        report, so there is nothing for a role to add here.

        The widths are inline styles rather than classes because they are data —
        the same rule `AirlineChip` follows for its brand colours.
      */}
      <div aria-hidden className="flex h-3 w-full overflow-hidden rounded-full">
        {bands.map(({ key, flights }) => (
          <div
            key={key}
            className={FILL[key]}
            style={{ width: `${(flights / total) * 100}%` }}
          />
        ))}
      </div>
      {/*
        Wraps rather than scrolls: three items need two lines on a 320px screen
        and one above it, and there is no row long enough to be worth a scroller
        and its edge fade.
      */}
      <ul className="text-muted mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums">
        {bands.map(({ key, label, flights }) => (
          <li key={key} className="flex items-center gap-2">
            <span aria-hidden className={`${FILL[key]} size-2 rounded-full`} />
            {label} {flights}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default HaulMix;
