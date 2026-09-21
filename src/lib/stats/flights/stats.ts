import { aircraft } from '@/lib/stats/flights/aircraft';
import { airline } from '@/lib/stats/flights/airlines';
import { airport } from '@/lib/stats/flights/airports';
import { country } from '@/lib/stats/flights/countries';
import { greatCircleDistanceKm } from '@/lib/stats/flights/geo';
import type {
  AircraftUsage,
  AirlineRank,
  AirportVisit,
  CountryVisit,
  Flight,
  FlightLeg,
  FlightTotals,
  ManufacturerUsage,
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

/**
 * Carriers, ranked by flights and then by how far those flights went.
 *
 * Grouped on the raw `flights.airline` value rather than on a resolved
 * registry entry, so a carrier nobody has added to `airlines.ts` yet still
 * ranks — with `airline: null` and the caller rendering the bare code. Unlike
 * an airport missing from its registry, this makes no total wrong: the flight
 * happened, its distance is already known, and only its name is missing.
 *
 * The same three-term sort as `rankRoutes`, for the same reason. `OS` and `BA`
 * are tied at four flights in the seed, so without the distance term the order
 * would depend on which row Postgres handed over first.
 */
export function rankAirlines(legs: FlightLeg[]): AirlineRank[] {
  const carriers = new Map<string, AirlineRank>();

  for (const { flight, distanceKm } of legs) {
    const carrier = carriers.get(flight.airline);

    if (carrier) {
      carrier.flights += 1;
      carrier.distanceKm += distanceKm;
      continue;
    }

    carriers.set(flight.airline, {
      code: flight.airline,
      airline: airline(flight.airline),
      flights: 1,
      distanceKm,
    });
  }

  return [...carriers.values()].sort(
    (x, y) =>
      y.flights - x.flights ||
      y.distanceKm - x.distanceKm ||
      x.code.localeCompare(y.code),
  );
}

/**
 * Types of aeroplane, ranked by flights.
 *
 * Two absences, and they mean different things. `flight.aircraft` being null
 * is a flight whose type was never recorded, and it is left out entirely —
 * "unknown" is not a type of aeroplane and does not belong in a distribution
 * of them. `aircraft()` returning null is a type that exists but that
 * `aircraft.ts` has not been told about, and it ranks on its raw string.
 *
 * Count then key, with no distance term: `A220-300` and `A320neo` are tied at
 * six in the seed, and the key is what settles them.
 */
export function aircraftUsage(legs: FlightLeg[]): AircraftUsage[] {
  const types = new Map<string, AircraftUsage>();

  for (const { flight } of legs) {
    if (!flight.aircraft) {
      continue;
    }

    const type = types.get(flight.aircraft);

    if (type) {
      type.flights += 1;
      continue;
    }

    types.set(flight.aircraft, {
      key: flight.aircraft,
      aircraft: aircraft(flight.aircraft),
      flights: 1,
    });
  }

  return [...types.values()].sort(
    (x, y) => y.flights - x.flights || x.key.localeCompare(y.key),
  );
}

/**
 * Who built them, rolled up off `aircraftUsage` rather than off the legs. The
 * mix is a second reading of the same numbers, so deriving it from the same
 * array is what stops it from disagreeing with the table above it on the page.
 *
 * A type the registry does not know carries no manufacturer and contributes
 * nothing, so the mix can total fewer flights than the log does. A percentage
 * therefore has to be taken against the mix's own total and not against
 * `flightTotals`, or it silently under-reports every share.
 */
export function manufacturerMix(usage: AircraftUsage[]): ManufacturerUsage[] {
  const makers = new Map<string, ManufacturerUsage>();

  for (const { aircraft: type, flights } of usage) {
    if (!type) {
      continue;
    }

    const maker = makers.get(type.manufacturer);

    if (maker) {
      maker.flights += flights;
      continue;
    }

    makers.set(type.manufacturer, {
      manufacturer: type.manufacturer,
      flights,
    });
  }

  return [...makers.values()].sort(
    (x, y) =>
      y.flights - x.flights || x.manufacturer.localeCompare(y.manufacturer),
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

/**
 * The same endpoint appearances as `airportVisits`, folded onto the country,
 * so a Zurich–Geneva hop counts Switzerland twice. Both functions therefore
 * describe the same 52 endpoints, and the flag row cannot disagree with the
 * globe about how much of the map is Swiss.
 *
 * Ordered by visits, then by code, which is the order the flag row reads in:
 * most flown first. Alphabetical was the alternative and says nothing — every
 * other list on the page is ranked.
 *
 * The null branch stays quiet, unlike the one in `toLegs`. A country code that
 * the registry has never heard of is unreachable from outside: the airports
 * are a closed set and `countries.test.ts` fails the moment one of their codes
 * is missing here.
 */
export function countryVisits(legs: FlightLeg[]): CountryVisit[] {
  const visits = new Map<string, CountryVisit>();

  for (const { countryCode } of legs.flatMap(({ from, to }) => [from, to])) {
    const visit = visits.get(countryCode);

    if (visit) {
      visit.visits += 1;
      continue;
    }

    const visited = country(countryCode);

    if (visited) {
      visits.set(countryCode, { country: visited, visits: 1 });
    }
  }

  return [...visits.values()].sort(
    (x, y) =>
      y.visits - x.visits || x.country.code.localeCompare(y.country.code),
  );
}
