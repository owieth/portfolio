import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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
 * Untyped for now — `createClient<Database>` arrives alongside the generated
 * types once there is a schema to generate them from.
 */
let client: SupabaseClient | null = null;

export const getSupabaseClient = (): SupabaseClient | null => {
  if (!isSupabaseEnabled) return null;

  client ??= createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return client;
};
