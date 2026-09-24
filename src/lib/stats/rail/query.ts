import 'server-only';

import type {
  RailLine,
  RailRide,
  RailStop,
  RailStopVia,
} from '@/lib/stats/rail/types';
import type { Tables } from '@/lib/supabase/database.types';
import { getSupabaseClient } from '@/lib/supabase/server';

/**
 * The only I/O in the rail stats feature, the counterpart of `loadFlights` in
 * `@/lib/stats/flights/query`. Everything downstream is pure and takes what
 * this returns. It renames rows and does nothing else: checking that a ride's
 * stops are on its line belongs to the stats layer, which can warn and skip.
 */

/**
 * A result, never an exception, for the reason `FlightsResult` gives: /stats is
 * prerendered at `next build`, so a throw here would break the build rather
 * than a request.
 *
 * All or nothing. A failed read of any one table empties all three, because
 * lines without their stops, or rides without their lines, would render as
 * coverage that is quietly wrong rather than as an empty state.
 */
export type RailResult =
  | { configured: false; lines: []; stops: []; rides: [] }
  | {
      configured: true;
      error?: string;
      lines: RailLine[];
      stops: RailStop[];
      rides: RailRide[];
    };

const empty = (): { lines: []; stops: []; rides: [] } => ({
  lines: [],
  stops: [],
  rides: [],
});

const failed = (error: string): RailResult => ({
  configured: true,
  error,
  ...empty(),
});

/**
 * Paged rather than raising the limit. PostgREST caps every response at
 * `max_rows` (1000, in `supabase/config.toml` and on the hosted project), and
 * `.limit()` cannot ask past it — so the ~6'000 stops need several requests
 * whatever the client says. Raising `max_rows` would work, but it is a setting
 * in the dashboard that no code here can see or enforce.
 *
 * The loop advances by the rows it actually received and stops on an empty
 * page, rather than on a short one. That costs one extra request per table,
 * and buys correctness under any cap: were `max_rows` ever lowered below
 * `PAGE_SIZE`, stopping on a short page would end after the first one, and
 * stepping by `PAGE_SIZE` would skip rows. A range past the end is a 200 with
 * `[]`, not an error.
 *
 * Paging is only sound over a total order, so every caller sorts down to a
 * unique key.
 */
const PAGE_SIZE = 1000;

type Page<Row> = (
  from: number,
  to: number,
) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>;

type ReadAll<Row> = { rows: Row[]; error: null } | { rows: null; error: string };

async function readAll<Row>(page: Page<Row>): Promise<ReadAll<Row>> {
  const rows: Row[] = [];

  for (;;) {
    const { data, error } = await page(rows.length, rows.length + PAGE_SIZE - 1);

    if (error) return { rows: null, error: error.message };
    if (!data?.length) return { rows, error: null };

    rows.push(...data);
  }
}

const toLine = (row: Tables<'rail_lines'>): RailLine => ({
  id: row.id,
  displayName: row.display_name,
  category: row.category,
  networkRegion: row.network_region,
  operators: row.operators,
  terminalA: row.terminal_a,
  terminalB: row.terminal_b,
  trueTerminalA: row.true_terminal_a,
  trueTerminalB: row.true_terminal_b,
  seasonal: row.seasonal,
  tripsPerWeek: row.trips_per_week,
  hasGeometry: row.has_geometry,
  missingSince: row.missing_since,
});

const toStop = (row: Tables<'rail_line_stops'>): RailStop => ({
  lineId: row.line_id,
  sequence: row.sequence,
  stopName: row.stop_name,
  sloid: row.sloid,
  didok: row.didok,
  lat: row.lat,
  lon: row.lon,
  // The generated type says `string`; the column's check says one of four.
  via: row.via as RailStopVia,
  junction: row.junction,
  missingSince: row.missing_since,
});

const toRide = (row: Tables<'rail_rides'>): RailRide => ({
  id: row.id,
  lineId: row.line_id,
  riddenOn: row.ridden_on,
  fromDidok: row.from_didok,
  toDidok: row.to_didok,
});

export async function loadRail(): Promise<RailResult> {
  const supabase = getSupabaseClient();

  if (!supabase) return { configured: false, ...empty() };

  try {
    const [lines, stops, rides] = await Promise.all([
      readAll((from, to) =>
        supabase
          .from('rail_lines')
          .select('*')
          .order('id')
          .range(from, to),
      ),
      readAll((from, to) =>
        supabase
          .from('rail_line_stops')
          .select('*')
          // The primary key, and the order a line's stops are listed in.
          .order('line_id')
          .order('sequence')
          .range(from, to),
      ),
      readAll((from, to) =>
        supabase
          .from('rail_rides')
          .select('*')
          // Newest first, then the order the day was entered, as the flights
          // do: `ridden_on` is a `date` and cannot separate two rides on one
          // day. `id` only makes the order total, which the paging needs.
          .order('ridden_on', { ascending: false })
          .order('created_at', { ascending: true })
          .order('id')
          .range(from, to),
      ),
    ]);

    if (lines.error !== null) return failed(lines.error);
    if (stops.error !== null) return failed(stops.error);
    if (rides.error !== null) return failed(rides.error);

    return {
      configured: true,
      lines: lines.rows.map(toLine),
      stops: stops.rows.map(toStop),
      rides: rides.rows.map(toRide),
    };
  } catch {
    return failed('unreachable');
  }
}
