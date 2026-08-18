/**
 * Env reads for the analytics layer. No zod — the surface is a handful of
 * strings and two booleans, and the whole layer no-ops when they are unset, so
 * a validation dependency would buy nothing.
 *
 * `GTM_ID` and `GA_ID` are public (`NEXT_PUBLIC_`) because the browser needs
 * them. `GA4_API_SECRET` is server-only and powers the GA4 Measurement Protocol
 * layer (see `@/lib/analytics/server`); `GA_ID` doubles as its `measurement_id`.
 * `SITE_URL` lives in `@/lib/site`.
 *
 * Unset ⇒ the matching `is…Enabled` flag is false ⇒ no GTM script renders,
 * `track()` only logs to the console, and the server layer skips its POST, so
 * dev and CI stay silent.
 */
export const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID ?? '';
export const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? '';
export const GA4_API_SECRET = process.env.GA4_API_SECRET ?? '';

export const isAnalyticsEnabled = Boolean(GTM_ID && GA_ID);
export const isServerAnalyticsEnabled = Boolean(GA_ID && GA4_API_SECRET);
