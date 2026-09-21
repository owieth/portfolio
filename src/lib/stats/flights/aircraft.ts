import type { Aircraft } from '@/lib/stats/flights/types';

/**
 * The seven types in the log, keyed on **the string already stored in
 * `flights.aircraft`**. Keying on what is in the column rather than on the
 * ICAO designator is what makes this registry a pure addition: no migration,
 * no backfill, nothing to keep in step.
 *
 * The `icao` field is why this is worth a file rather than a `prettify()` in a
 * component. `A220-300` is a marketing name and not a designator — ICAO calls
 * it `BCS3`, a leftover from when it was the Bombardier CSeries, and `A320neo`
 * is `A20N`. A Flighty CSV export carries `Aircraft Type Name`, so the day an
 * import lands the keys here change to whatever Flighty writes, and the ICAO
 * codes are the column the two sides are joined on.
 *
 * Hand-written because there is nothing to generate from: no free,
 * well-licensed, machine-readable Doc 8643 dump exists, and `aircraft-types`,
 * `icao8643` and `doc8643` are not published packages. At seven rows that is
 * not a workaround, it is the whole solution.
 */
export const AIRCRAFT = {
  A320: { name: 'Airbus A320', manufacturer: 'Airbus', icao: 'A320' },
  A320neo: { name: 'Airbus A320neo', manufacturer: 'Airbus', icao: 'A20N' },
  'A220-100': { name: 'Airbus A220-100', manufacturer: 'Airbus', icao: 'BCS1' },
  'A220-300': { name: 'Airbus A220-300', manufacturer: 'Airbus', icao: 'BCS3' },
  'A330-300': { name: 'Airbus A330-300', manufacturer: 'Airbus', icao: 'A333' },
  'B777-300ER': {
    name: 'Boeing 777-300ER',
    manufacturer: 'Boeing',
    icao: 'B77W',
  },
  E190: { name: 'Embraer E190', manufacturer: 'Embraer', icao: 'E190' },
} as const satisfies Record<string, Aircraft>;

export type AircraftKey = keyof typeof AIRCRAFT;

/**
 * Null for a type the registry does not know, and the caller falls back to the
 * raw string. `flights.aircraft` is nullable, so a caller has two absences to
 * handle and they mean different things: null in the column is a flight whose
 * type was never recorded, null from here is a type nobody has added yet.
 *
 * Like `airline()`, and unlike `airport()`, an unknown value here never makes a
 * total wrong, so nothing skips the flight over it.
 */
export const aircraft = (key: string): Aircraft | null =>
  Object.hasOwn(AIRCRAFT, key) ? AIRCRAFT[key as AircraftKey] : null;
