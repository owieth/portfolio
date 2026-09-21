import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/supabase/database.types';
import {
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
  isSupabaseEnabled,
} from '@/lib/supabase/config';

/**
 * The single Supabase entry point for server code. `import 'server-only'` turns
 * a `'use client'` import of this module into a build error, so `supabase-js`
 * can never be dragged into the browser bundle.
 *
 * Construction is lazy and memoised. `createClient` throws on an empty URL, so
 * it has to run after the `isSupabaseEnabled` check rather than at module
 * scope, where it would fire during module evaluation and break `next build`.
 * Reusing one instance across requests is safe — an anon PostgREST read holds
 * no per-request state.
 *
 * Null when the env is unset, mirroring how `trackServer` no-ops: the caller
 * gates on it and falls back, which `strict` enforces at the call site.
 *
 * The auth options stop `createClient` building a `GoTrueClient` with session
 * persistence on, which on a server with no `localStorage` falls back to memory
 * storage and can start a refresh ticker for a session that will never exist.
 *
 * `Database` is generated from the schema, never hand-written:
 *
 *   supabase gen types typescript --local > src/lib/supabase/database.types.ts
 *
 * Regenerate whenever a migration lands. Without the generic, `data` comes back
 * effectively untyped and the pure derivations downstream have no enforced
 * input contract.
 */

/**
 * One hour, the same window `@/app/(site)/design/page.tsx` uses for its GitHub
 * read, so the site has one caching idiom rather than two.
 *
 * It is attached here rather than as a segment-level `export const revalidate`
 * on the page, because `supabase-js` takes no per-query cache option — it calls
 * `fetch` internally, and the only seam is the client's `global.fetch`. That
 * turns out to be the better place anyway: the cache belongs to the query, so a
 * second section on /stats with its own data gets its own window instead of
 * inheriting the route's.
 *
 * Next has not cached `fetch` by default since 15, so this has to be explicit.
 * Only GET is cacheable, which every PostgREST read through this client is.
 */
const REVALIDATE_SECONDS = 3600;

let client: SupabaseClient<Database> | null = null;

export const getSupabaseClient = (): SupabaseClient<Database> | null => {
  if (!isSupabaseEnabled) return null;

  client ??= createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          // Cleared rather than spread through: Next refuses an explicit
          // `cache` alongside `next.revalidate`, and `supabase-js` sets
          // `cache: 'no-store'` on some paths.
          cache: undefined,
          next: { revalidate: REVALIDATE_SECONDS },
        }),
    },
  });

  return client;
};
