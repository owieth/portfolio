/**
 * Whether /stats is advertised. The seed is 26 mocked flights, so the page is
 * worth visiting but not worth pointing at from the nav until the real Flighty
 * import lands — this hides the links without holding the feature on a branch.
 *
 * Unset means hidden, the same direction as `@/lib/analytics/config`: absent
 * env ⇒ the layer stays quiet.
 *
 * `NEXT_PUBLIC_` because `Header` is a client component, which is also why this
 * is an env read rather than a feature flag. A flag from `flags/next` is
 * evaluated per request and reads cookies for its overrides, and the nav lives
 * in `app/(site)/layout.tsx` — so one call there turns Home, Projects, all
 * three case studies, Privacy and Stats from prerendered into server-rendered,
 * and /stats loses the prerender its 1h cache is built around. Keeping the
 * pages static needs the precompute pattern and Routing Middleware, which is a
 * lot of machinery for one link. Inlined at build time is the right trade here:
 * flipping this is a deploy either way.
 *
 * The route itself stays reachable at /stats. This hides it, it does not gate
 * it.
 */
export const isStatsEnabled = process.env.NEXT_PUBLIC_STATS_ENABLED === 'true';
