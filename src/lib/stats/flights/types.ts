/**
 * The vocabulary of the flight stats layer. Everything below is a plain shape:
 * no class, no I/O, no React, so the derivations in `stats.ts` can be tested
 * with object literals and nothing else.
 *
 * `Flight` is the domain type, hand-written in camelCase rather than derived
 * from `Tables<'flights'>` in `@/lib/supabase/database.types`. Mapping the
 * snake_case row onto it belongs to the page that runs the query; keeping the
 * generated type out of here is what keeps this layer free of Supabase.
 * `created_at` has no counterpart — it orders rows inside Postgres and says
 * nothing the page renders.
 */

/**
 * GeoJSON geometry, straight from the spec types. `greatCirclePath` returns a
 * `MultiLineString` because a great circle crossing the antimeridian has to be
 * drawn as two lines; see the docblock in `geo.ts`.
 */
export type { MultiLineString, Position } from 'geojson';

export interface Airport {
  iata: string;
  name: string;
  city: string;
  country: string;
  /** ISO 3166-1 alpha-2, and a key into `COUNTRIES`. */
  countryCode: string;
  lat: number;
  lon: number;
}

export interface Country {
  /** ISO 3166-1 alpha-2, uppercase. */
  code: string;
  name: string;
}

export interface Flight {
  id: string;
  /** `YYYY-MM-DD`. The column is a `date`, so there is no time and no zone. */
  flownOn: string;
  /**
   * IATA codes, typed as `string` rather than `AirportCode` on purpose. The
   * column is a `text` with a `~ '^[A-Z]{3}$'` check, which constrains the
   * shape and not the value, so a code outside the registry is reachable at
   * runtime. `toLegs` is what narrows them.
   */
  origin: string;
  destination: string;
  /** Carrier and number are separate columns: `LX` and `1954`. */
  airline: string;
  flightNumber: string;
  aircraft: string | null;
  /** Scheduled block time, gate to gate — not time in the air. */
  durationMinutes: number;
}

/** A flight with both endpoints resolved against the registry. */
export interface FlightLeg {
  flight: Flight;
  from: Airport;
  to: Airport;
  distanceKm: number;
}

/** One route, both directions collapsed into it. */
export interface RouteRank {
  /** The sorted IATA pair, `LHR-ZRH`, which is what makes the collapse work. */
  key: string;
  a: Airport;
  b: Airport;
  flights: number;
  /** Summed across every flight on the route, not the one-way distance. */
  distanceKm: number;
}

export interface FlightTotals {
  flights: number;
  distanceKm: number;
  durationMinutes: number;
  /** Distinct, not visits. Flying through Zurich twenty times counts once. */
  airports: number;
  countries: number;
}

export interface AirportVisit {
  airport: Airport;
  /** Times the airport appears as an endpoint, so a turnaround counts twice. */
  visits: number;
}
