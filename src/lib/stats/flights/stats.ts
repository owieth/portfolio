import { airport } from '@/lib/stats/flights/airports';
import { greatCircleDistanceKm } from '@/lib/stats/flights/geo';
import type {
  AirportVisit,
  Flight,
  FlightLeg,
  FlightTotals,
  RouteRank,
} from '@/lib/stats/flights/types';

/**
 * Everything the /stats page reads, derived from the rows and the registry.
 * Pure: no query, no cache, no clock, so the numbers on the page are exactly
 * the numbers in `stats.test.ts`.
 *
 * `toLegs` is the seam. Everything after it takes `FlightLeg[]` and can assume
 * both endpoints resolved, which is why it is the only function here that has
 * to think about a code the registry has never heard of.
 */

/**
 * Rows to legs, resolving both IATA codes against the registry.
 *
 * With no airports table there is no foreign key to reject a typo, so a code
 * missing from the registry is dropped with a warning rather than counted as
 * a zero-distance leg. Loud, because the alternative is totals that are
 * quietly wrong. Flying somewhere new means adding the airport to
 * `airports.ts` in the same change as the row.
 *
 * Input order is preserved — ordering is the query's job, and keeping it out
 * of here keeps this a map and a filter.
 */
export function toLegs(flights: Flight[]): FlightLeg[] {
  const legs: FlightLeg[] = [];

  for (const flight of flights) {
    const from = airport(flight.origin);
    const to = airport(flight.destination);

    if (!from || !to) {
      const unknown = [!from && flight.origin, !to && flight.destination]
        .filter(Boolean)
        .join(', ');

      console.warn(
        `[stats/flights] skipping ${flight.airline} ${flight.flightNumber} on ${flight.flownOn}: ${unknown} is not in the airport registry`,
      );
      continue;
    }

    legs.push({
      flight,
      from,
      to,
      distanceKm: greatCircleDistanceKm(from, to),
    });
  }

  return legs;
}

export function flightTotals(legs: FlightLeg[]): FlightTotals {
  const airports = new Set<string>();
  const countries = new Set<string>();
  let distanceKm = 0;
  let durationMinutes = 0;

  for (const { from, to, distanceKm: legDistance, flight } of legs) {
    airports.add(from.iata).add(to.iata);
    countries.add(from.country).add(to.country);
    distanceKm += legDistance;
    durationMinutes += flight.durationMinutes;
  }

  return {
    flights: legs.length,
    distanceKm,
    durationMinutes,
    // Distinct, not visits: twenty turnarounds through Zurich are one airport,
    // and ZRH and GVA are one country.
    airports: airports.size,
    countries: countries.size,
  };
}

/**
 * Routes, both directions collapsed onto the sorted IATA pair: `ZRH -> LHR`
 * and `LHR -> ZRH` are one route flown twice, not two routes.
 *
 * That collapse is keyed on the pair and nothing else, which is what keeps an
 * open jaw honest — `ZRH -> BOS` out and `JFK -> ZRH` back stay two routes,
 * and a connection through Vienna stays two rather than becoming a direct
 * flight that never happened.
 *
 * Ordered by flights, then total distance, then key. The last term is there so
 * the order is stable rather than dependent on the order rows arrived in.
 */
export function rankRoutes(legs: FlightLeg[]): RouteRank[] {
  const routes = new Map<string, RouteRank>();

  for (const { from, to, distanceKm } of legs) {
    const [a, b] = from.iata < to.iata ? [from, to] : [to, from];
    const key = `${a.iata}-${b.iata}`;
    const route = routes.get(key);

    if (route) {
      route.flights += 1;
      route.distanceKm += distanceKm;
      continue;
    }

    routes.set(key, { key, a, b, flights: 1, distanceKm });
  }

  return [...routes.values()].sort(
    (x, y) =>
      y.flights - x.flights ||
      y.distanceKm - x.distanceKm ||
      x.key.localeCompare(y.key),
  );
}

/** Endpoint appearances, so a turnaround counts the airport twice. */
export function airportVisits(legs: FlightLeg[]): AirportVisit[] {
  const visits = new Map<string, AirportVisit>();

  for (const airportVisited of legs.flatMap(({ from, to }) => [from, to])) {
    const visit = visits.get(airportVisited.iata);

    if (visit) {
      visit.visits += 1;
      continue;
    }

    visits.set(airportVisited.iata, { airport: airportVisited, visits: 1 });
  }

  return [...visits.values()].sort(
    (x, y) =>
      y.visits - x.visits || x.airport.iata.localeCompare(y.airport.iata),
  );
}
