/**
 * Env reads for the Supabase layer. No zod — the surface is two strings and a
 * boolean, and the whole layer no-ops when they are unset, so a validation
 * dependency would buy nothing (same reasoning as `@/lib/analytics/config`).
 *
 * Neither var is `NEXT_PUBLIC_`. The publishable key would be safe to expose —
 * it resolves to the `anon` Postgres role and only reaches what RLS allows —
 * but every read in this layer happens on the server, and `NEXT_PUBLIC_*` is
 * inlined at build time, so prefixing would mean a rebuild just to rotate the
 * key. Unprefixed, it is read at runtime on each revalidation.
 *
 * This module constructs nothing on purpose. `createClient` throws
 * `supabaseUrl is required.` from its constructor on an empty URL; at module
 * scope that fires during module evaluation, before any `isSupabaseEnabled`
 * check can run, and `next build` dies collecting page data. CI builds with no
 * env at all, so that is the default path, not an edge case.
 *
 * Unset ⇒ `isSupabaseEnabled` is false ⇒ `getSupabaseClient()` returns null and
 * every reader falls back, so dev and CI stay silent.
 */
export const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
export const SUPABASE_PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ?? '';

export const isSupabaseEnabled = Boolean(
  SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY,
);
