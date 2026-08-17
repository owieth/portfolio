/**
 * Env reads for the analytics layer. No zod — the surface is three strings and
 * a boolean, and the whole layer no-ops when they are unset, so a validation
 * dependency would buy nothing.
 *
 * `GTM_ID` and `GA_ID` are public (`NEXT_PUBLIC_`) because the browser needs
 * them. `GA4_API_SECRET` is server-only (Measurement Protocol, a later layer)
 * and is deliberately not read here — see `.env.example`. `SITE_URL` lives in
 * `@/lib/site`.
 *
 * Unset ⇒ `isAnalyticsEnabled` is false ⇒ no GTM script renders and `track()`
 * only logs to the console, so dev and CI stay silent.
 */
export const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID ?? '';
export const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? '';

export const isAnalyticsEnabled = Boolean(GTM_ID && GA_ID);
