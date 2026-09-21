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

/**
 * A carrier. No logo field, and deliberately: airline logos are registered
 * trademarks, and every free set is either unlicensed or explicitly disclaims
 * the marks it ships. The brand colour with the IATA code set in type on it is
 * the version that infringes nothing — see the docblock in `airlines.ts`.
 */
export interface Airline {
  iata: string;
  name: string;
  /** Uppercase `#RRGGBB`. */
  colour: string;
  /** Whichever of white or black clears WCAG AA against `colour`. */
  onColour: string;
}

/**
 * A type of aeroplane. Keyed in the registry on the string already stored in
 * `flights.aircraft`, so `icao` is the value rather than the key — see the
 * docblock in `aircraft.ts` for why both are worth carrying.
 */
export interface Aircraft {
  name: string;
  manufacturer: string;
  /** ICAO Doc 8643 type designator, four characters. */
  icao: string;
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

/**
 * One carrier, resolved against the registry where it knows it.
 *
 * `code` is the raw `flights.airline` value rather than `airline.iata`, because
 * it is the one field that survives a carrier the registry has never heard of —
 * and it is what the ranking falls back to, both as the label and as the last
 * term of the sort.
 */
export interface AirlineRank {
  code: string;
  /** Null for a carrier outside the registry. The flights still count. */
  airline: Airline | null;
  flights: number;
  /** Summed across every flight the carrier operated. */
  distanceKm: number;
}

/**
 * One type of aeroplane, keyed on the raw `flights.aircraft` string the way
 * `AIRCRAFT` itself is. No distance: an aircraft type is a thing you sat in,
 * not a thing you flew between, and the ranking reads by count.
 */
export interface AircraftUsage {
  key: string;
  /** Null for a type outside the registry. The flights still count. */
  aircraft: Aircraft | null;
  flights: number;
}

/** The types rolled up onto who built them. */
export interface ManufacturerUsage {
  manufacturer: string;
  flights: number;
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

export interface CountryVisit {
  country: Country;
  /** Endpoint appearances, so a domestic hop counts its country twice. */
  visits: number;
}

/**
 * The longest and shortest flight in the log — the pair Flighty leads its stats
 * with, and the only two numbers on the page that name a single flight rather
 * than summarising all of them.
 *
 * `FlightLeg` rather than a flattened shape: the caller already knows how to
 * read one, and the distance is on it.
 *
 * Both are null only for an empty log. There is no state where one exists and
 * the other does not, and a log of one flight answers with it twice.
 */
export interface FlightSuperlatives {
  longest: FlightLeg | null;
  shortest: FlightLeg | null;
}

/**
 * A distance band. Not Flighty's `domestic / international / long haul`: every
 * flight in this log is international — `BSL` is EuroAirport, which the
 * registry places in France — so that split would read `0 / 26 / 2`, and a zero
 * renders as a bug rather than as a fact. See `haulMix`.
 */
export type HaulBandKey = 'short' | 'medium' | 'long';

export interface HaulBand {
  key: HaulBandKey;
  /** `short haul`. The bands are a closed set of three, so the label rides along. */
  label: string;
  flights: number;
}
