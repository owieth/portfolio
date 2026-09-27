import 'server-only';

import type { PostgrestResponse } from '@supabase/supabase-js';

import type { Flight } from '@/lib/stats/flights/types';
import { readFailed } from '@/lib/stats/read-failure';
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
 * A result at build time, an exception at runtime.
 *
 * With a 1h revalidate and no dynamic APIs, /stats is prerendered at
 * `next build` — Next keeps the fetch cacheable rather than flipping the route
 * dynamic, because `autoNoCache` only trips at `revalidate === 0`. A throw
 * there would break the build rather than a request, so a failed read answers
 * a result and the page renders an empty state.
 *
 * The hourly regeneration needs the opposite. Next caches whatever a render
 * returns, so that same result would swap a good /stats for its empty state
 * for an hour; only a render that throws keeps the last good page. So at
 * runtime a failed read throws. `readFailed` in `@/lib/stats/read-failure`
 * makes that call, and logs on both sides of it.
 *
 * An unset env is neither case. It is a deploy without Supabase rather than a
 * failed read, so it answers `configured: false` at build and at runtime
 * alike, and says nothing.
 *
 * `@/app/(site)/design/page.tsx` needs no such split. It calls `notFound()` on
 * a failed fetch outright, because reading `headers()` opts it out of ISR
 * first, so its failure path is only ever a runtime one.
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

  let response: PostgrestResponse<Tables<'flights'>>;
  try {
    response = await supabase
      .from('flights')
      .select('*')
      // Newest first, then the order the day was actually flown. The second
      // term is load-bearing: PostgREST guarantees no order of its own, and
      // `flown_on` is a `date`, which cannot separate the two legs of a
      // connection. `created_at` can — see the 20260921085602 migration, which
      // nudges the second leg of each seeded connection by a second.
      .order('flown_on', { ascending: false })
      .order('created_at', { ascending: true });
  } catch (thrown) {
    // Rarely reached: `postgrest-js` answers even a refused connection as an
    // `error`. Whatever does land here is unexpected, so the log carries it.
    readFailed('stats/flights', String(thrown));
    return { configured: true, error: 'unreachable', flights: [] };
  }

  const { data, error } = response;

  if (error) {
    readFailed('stats/flights', error.message);
    return { configured: true, error: error.message, flights: [] };
  }

  return { configured: true, flights: data.map(toFlight) };
}
