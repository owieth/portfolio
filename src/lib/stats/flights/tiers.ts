/**
 * How much weight a route or an airport has earned, as a step rather than as a
 * ratio.
 *
 * Flighty's scale: once, a handful, a lot. Absolute rather than interpolated
 * against the observed maximum, so a route keeps the weight it has earned
 * instead of being rescaled by every flight added after it. The tiers are
 * there to make a once-flown route findable, not to be proportional — which is
 * also why the 10+ stop stays even though no line reaches it yet.
 *
 * Shared because there are now two renderers: MapLibre on /stats, which wants
 * a `step` expression, and the share card, which wants a number. They have to
 * agree about what "a lot" means, and the only way to be sure of that is for
 * there to be one set of numbers.
 */

export interface Tier {
  /** The lowest count this tier covers. */
  from: number;
  value: number;
}

/** Line width in pixels, by how many flights the route has seen. */
export const ROUTE_FLIGHT_TIERS: Tier[] = [
  { from: 1, value: 1 },
  { from: 2, value: 2.25 },
  { from: 10, value: 4 },
];

/** Circle radius in pixels, by how many times the airport is an endpoint. */
export const AIRPORT_VISIT_TIERS: Tier[] = [
  { from: 1, value: 2.5 },
  { from: 2, value: 4 },
  { from: 10, value: 6.5 },
];

/**
 * The globe is interactive and read at whatever size the reader's window is;
 * the share card is a still, and most people meet it at a third of its size in
 * a Slack unfurl. The same weights would disappear there.
 */
export const SHARE_CARD_SCALE = 1.5;

export function tierValue(tiers: Tier[], count: number): number {
  let value = tiers[0].value;

  for (const tier of tiers) {
    if (count >= tier.from) value = tier.value;
  }

  return value;
}

/**
 * The same tiers as a MapLibre `step`: a base value, then alternating stop and
 * value. The first tier's `from` is implicit in `step`, which is why it is
 * dropped here and asserted in the test.
 */
export function stepExpression(
  property: string,
  tiers: Tier[],
): (number | string | string[])[] {
  return [
    'step',
    ['get', property],
    tiers[0].value,
    ...tiers.slice(1).flatMap(({ from, value }) => [from, value]),
  ];
}
