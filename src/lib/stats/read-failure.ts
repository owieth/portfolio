import { PHASE_PRODUCTION_BUILD } from 'next/constants';

/**
 * What a failed Supabase read on /stats does, which depends on when it fails.
 *
 * At `next build` it answers. A throw there would break the build rather than
 * a request, and there is no older page to keep anyway, so the loader returns
 * its failure result and the page prerenders its empty state. The first
 * regeneration, an hour later, gets another try.
 *
 * During that hourly regeneration it throws. Next caches whatever a render
 * returns, so a result there would swap a good /stats for its empty state
 * until the next one; only a render that throws makes Next keep serving the
 * last good page, and the passport card with it.
 *
 * It logs either way. Otherwise a failed read leaves no trace, in the build
 * output or in the function logs.
 *
 * `NEXT_PHASE` is read on each call rather than at module load, so tests can
 * stub it. It is not a documented env var — the documented phase is the
 * argument `next.config.js` receives — but `next build` sets it before it
 * forks the workers that prerender, and Next skips `instrumentation.ts` at
 * build on the same check. Were an upgrade to stop setting it, a failed read
 * would start failing the build: loud, rather than stale.
 */
export function readFailed(source: string, message: string): void {
  console.error(`[${source}] read failed: ${message}`);

  if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) return;

  throw new Error(`${source} read failed: ${message}`);
}
