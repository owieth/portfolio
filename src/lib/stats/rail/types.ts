/**
 * The vocabulary of the rail stats layer. Plain shapes, the same as the
 * flights: no class, no I/O, no React, so the derivations can be tested with
 * object literals and nothing else.
 *
 * Hand-written in camelCase rather than derived from `Tables<'rail_lines'>` and
 * friends in `@/lib/supabase/database.types`. `loadRail` in `./query` renames
 * the snake_case rows onto these; keeping the generated types out of here is
 * what keeps this layer free of Supabase.
 *
 * `created_at`, `edited_fields` and `route_ids` have no counterpart. They are
 * bookkeeping for the reconcile in rail/src/reconcile.ts and say nothing the
 * page renders.
 */

export interface RailLine {
  /** `fernverkehr:IR35`. Stable across feeds, which is why rides key on it. */
  id: string;
  displayName: string;
  /** The feed's `route_desc` code, unchecked: the feed gains categories. */
  category: string;
  networkRegion: string;
  operators: string[];
  terminalA: string;
  terminalB: string;
  trueTerminalA: string;
  trueTerminalB: string;
  /** Null on a line seeded by hand, which has no timetable behind it. */
  seasonal: boolean | null;
  tripsPerWeek: number | null;
  /** Whether `public/rail/lines.geojson` has a feature with this `id`. */
  hasGeometry: boolean;
  /**
   * `YYYY-MM-DD`, the day a December refresh first found the line gone from the
   * feed. The row stays because rides may reference it.
   */
  missingSince: string | null;
}

/**
 * The column is a `text`, but its check constraint pins it to these four, so
 * unlike an IATA code on the flights the value cannot drift outside the set.
 */
export type RailStopVia = 'backbone' | 'extension' | 'detour' | 'branch';

export interface RailStop {
  lineId: string;
  /** From 1, in canonical order: the trunk, then each branch block. */
  sequence: number;
  stopName: string;
  sloid: string | null;
  /** Seven digits. Null only for a stop seeded by hand the register lacks. */
  didok: string | null;
  lat: number | null;
  lon: number | null;
  via: RailStopVia;
  /** The Didok number this stop was placed against; null on the trunk. */
  junction: string | null;
  missingSince: string | null;
}

/**
 * A whole line when both stops are null, the stretch between them when both
 * are set; the table's check rules out one without the other. Either order is
 * fine, since a line is ridden in both directions.
 *
 * The stops are Didok numbers, not sequences, and nothing in Postgres checks
 * they are on the line. That is the stats layer's job.
 */
export interface RailRide {
  id: string;
  lineId: string;
  /** `YYYY-MM-DD`. The column is a `date`, so there is no time and no zone. */
  riddenOn: string;
  fromDidok: string | null;
  toDidok: string | null;
}

/**
 * A ride resolved against its line: the stops it went through, as sequences.
 * What `toCoverage` in `./stats` returns, and so a ride whose line and stops
 * are known to the data.
 */
export interface RailRideCoverage {
  ride: RailRide;
  line: RailLine;
  /** Ascending and distinct, whichever way the ride ran. */
  sequences: number[];
}

/**
 * A ride as the log prints it: where it got on and off, by name, in the
 * direction it ran. Both null for a whole-line ride.
 */
export interface RailRideLogEntry {
  ride: RailRide;
  line: RailLine;
  from: string | null;
  to: string | null;
}

export interface RailLineProgress {
  line: RailLine;
  stops: number;
  /** Distinct, so two rides over the same stretch count it once. */
  covered: number;
  /** `covered / stops`, from 0 to 1. A line with no stops is 0. */
  share: number;
  /** Any ride at all, even one that covered a single stop. */
  touched: boolean;
  /** Every stop covered. Never true of a line with no stops. */
  complete: boolean;
}

/** The same counts as `RailLineProgress`, summed over one `category`. */
export interface RailCategoryProgress {
  category: string;
  lines: number;
  touched: number;
  complete: number;
  stops: number;
  covered: number;
}

/** A station, once however many lines it is on. */
export interface RailStation {
  didok: string;
  stopName: string;
  lat: number | null;
  lon: number | null;
}

export interface RailTotals {
  lines: number;
  touched: number;
  complete: number;
  /** Distinct by Didok number across every line. */
  stations: number;
}
