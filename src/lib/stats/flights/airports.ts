import type { Airport } from '@/lib/stats/flights/types';

/**
 * The half of the flight data that does not live in Supabase. Airport
 * coordinates, names and countries never change, so they belong in git rather
 * than in a second table nobody would ever open Studio to edit. A row in
 * `public.flights` carries IATA codes and nothing else.
 *
 * `as const satisfies Record<string, Airport>` earns both halves: `satisfies`
 * rejects a malformed entry at the point of definition, and `as const` keeps
 * the keys literal so `AirportCode` comes out a union rather than `string`. A
 * typo downstream is then a type error instead of a runtime shrug.
 *
 * Coordinates are the airport reference point. They reproduce the ground
 * truths pinned in `geo.test.ts` exactly at R = 6371.0088 km — ZRH-LHR 787.6,
 * ZRH-JFK 6309.3, GVA-LHR 753.7 — so a bad digit here fails there.
 *
 * `countryCode` is ISO 3166-1 alpha-2 and a key into `countries.ts`. Eleven
 * lines written by hand: filtering the public-domain OurAirports dump
 * (https://ourairports.com/data/, regenerated nightly) down to our codes comes
 * to about 1.7 KB, but it is a build script plus a CSV parser to obtain one
 * field for thirteen rows. Worth revisiting the day hand-editing this registry
 * is the bottleneck.
 *
 * Flying somewhere new is one entry here alongside the new row in Supabase.
 */
export const AIRPORTS = {
  ZRH: {
    iata: 'ZRH',
    name: 'Zurich',
    city: 'Zurich',
    country: 'Switzerland',
    countryCode: 'CH',
    lat: 47.4647,
    lon: 8.5492,
  },
  GVA: {
    iata: 'GVA',
    name: 'Geneva',
    city: 'Geneva',
    country: 'Switzerland',
    countryCode: 'CH',
    lat: 46.2381,
    lon: 6.1089,
  },
  BSL: {
    iata: 'BSL',
    name: 'EuroAirport Basel-Mulhouse-Freiburg',
    city: 'Basel',
    // France, not Switzerland — both fields. EuroAirport sits on French soil
    // under joint operation, and the country count should say so rather than
    // round it. Flipping one of these two and not the other is what
    // `airports.test.ts` compares them against `COUNTRIES` to catch.
    country: 'France',
    countryCode: 'FR',
    lat: 47.5896,
    lon: 7.5299,
  },
  LHR: {
    iata: 'LHR',
    name: 'London Heathrow',
    city: 'London',
    country: 'United Kingdom',
    countryCode: 'GB',
    lat: 51.47,
    lon: -0.4543,
  },
  OSL: {
    iata: 'OSL',
    name: 'Oslo Gardermoen',
    city: 'Oslo',
    country: 'Norway',
    countryCode: 'NO',
    lat: 60.1939,
    lon: 11.1004,
  },
  BOS: {
    iata: 'BOS',
    name: 'Boston Logan',
    city: 'Boston',
    country: 'United States',
    countryCode: 'US',
    lat: 42.3656,
    lon: -71.0096,
  },
  JFK: {
    iata: 'JFK',
    name: 'John F. Kennedy',
    city: 'New York',
    country: 'United States',
    countryCode: 'US',
    lat: 40.6413,
    lon: -73.7781,
  },
  VIE: {
    iata: 'VIE',
    name: 'Vienna',
    city: 'Vienna',
    country: 'Austria',
    countryCode: 'AT',
    lat: 48.1103,
    lon: 16.5697,
  },
  RHO: {
    iata: 'RHO',
    name: 'Rhodes Diagoras',
    city: 'Rhodes',
    country: 'Greece',
    countryCode: 'GR',
    lat: 36.4054,
    lon: 28.0862,
  },
  AMS: {
    iata: 'AMS',
    name: 'Amsterdam Schiphol',
    city: 'Amsterdam',
    country: 'Netherlands',
    countryCode: 'NL',
    lat: 52.3105,
    lon: 4.7683,
  },
  BCN: {
    iata: 'BCN',
    name: 'Barcelona El Prat',
    city: 'Barcelona',
    country: 'Spain',
    countryCode: 'ES',
    lat: 41.2971,
    lon: 2.0785,
  },
  LIS: {
    iata: 'LIS',
    name: 'Lisbon Humberto Delgado',
    city: 'Lisbon',
    country: 'Portugal',
    countryCode: 'PT',
    lat: 38.7756,
    lon: -9.1354,
  },
  BER: {
    iata: 'BER',
    name: 'Berlin Brandenburg',
    city: 'Berlin',
    country: 'Germany',
    countryCode: 'DE',
    lat: 52.3667,
    lon: 13.5033,
  },
} as const satisfies Record<string, Airport>;

export type AirportCode = keyof typeof AIRPORTS;

/**
 * Null for a code the registry does not know. Without an airports table there
 * is no foreign key to reject a typo, so the lookup has to be fallible and the
 * caller has to say what it does about it — see `toLegs`.
 *
 * `Object.hasOwn` rather than `in`, which walks the prototype chain and would
 * hand back `Object.prototype.toString` for an origin of `'toString'`.
 */
export const airport = (code: string): Airport | null =>
  Object.hasOwn(AIRPORTS, code) ? AIRPORTS[code as AirportCode] : null;
