import 'server-only';

import type { Flight } from '@/lib/stats/flights/types';
import type { Tables } from '@/lib/supabase/database.types';
import { getSupabaseClient } from '@/lib/supabase/server';

/**
 * The only I/O in the flight stats feature. Everything downstream — `toLegs`,
 * the totals, the ranking — is pure and takes what this returns.
 *
 * Resolving the IATA codes against the registry is *not* done here: `toLegs` in
 * `@/lib/stats/flights/stats` already owns that, warning and skipping a code the
 * registry has never heard of. This function only renames the snake_case row
 * onto the camelCase domain type, which is what keeps the pure layer free of
 * the generated Supabase types.
 */

/**
 * A result, never an exception. With a 1h revalidate and no dynamic APIs,
 * /stats is prerendered at `next build` — Next keeps the fetch cacheable rather
 * than flipping the route dynamic, because `autoNoCache` only trips at
 * `revalidate === 0`. That makes an unset env or an unreachable Supabase a
 * *build-time* failure, so throwing here would break the build rather than a
 * request. The page renders an empty state instead.
 *
 * This is the opposite of `@/app/(site)/design/page.tsx`, which does call
 * `notFound()` on a failed fetch — it can, because reading `cookies()` opts it
 * out of ISR first, so its failure path is a runtime one.
 */
export type FlightsResult =
  | { configured: false; flights: [] }
  | { configured: true; error?: string; flights: Flight[] };

const toFlight = (row: Tables<'flights'>): Flight => ({
  id: row.id,
  flownOn: row.flown_on,
  origin: row.origin,
  destination: row.destination,
  airline: row.airline,
  flightNumber: row.flight_number,
  aircraft: row.aircraft,
  durationMinutes: row.duration_minutes,
});

export async function loadFlights(): Promise<FlightsResult> {
  const supabase = getSupabaseClient();

  if (!supabase) return { configured: false, flights: [] };

  try {
    const { data, error } = await supabase
      .from('flights')
      .select('*')
      // Newest first, then the order the day was actually flown. The second
      // term is load-bearing: PostgREST guarantees no order of its own, and
      // `flown_on` is a `date`, which cannot separate the two legs of a
      // connection. `created_at` can — see the 20260921085602 migration, which
      // nudges the second leg of each seeded connection by a second.
      .order('flown_on', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) return { configured: true, error: error.message, flights: [] };

    return { configured: true, flights: data.map(toFlight) };
  } catch {
    return { configured: true, error: 'unreachable', flights: [] };
  }
}
