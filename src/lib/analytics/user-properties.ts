import { isAnalyticsEnabled } from '@/lib/analytics/config';
import { resolveConsent } from '@/lib/analytics/consent';
import { PFYLSORTE } from '@/lib/wo-haere/data/bern';
import { prefersReducedMotion } from '@/lib/wo-haere/motion';
import { gsammleteKantöne } from '@/lib/wo-haere/store';
import type { WurfEintrag } from '@/lib/wo-haere/types';

/**
 * GA4 user properties, derived entirely from state the site already keeps — the
 * wo-haere throw log (localStorage) plus the browser's own device signals. No
 * new storage, no new tracking; they just turn every other event into something
 * segmentable by how engaged the visitor already is (first-throw vs 30th-throw
 * behaviour) and by their device context.
 *
 * GA4 caps user-property names at 24 chars and values at 36; the six below stay
 * well inside both, and six is far under the 25-property limit.
 */
export type UserProperties = {
  throw_count: number;
  cantons_collected: number;
  dart_skins_unlocked: number;
  color_scheme: 'light' | 'dark';
  reduced_motion: boolean;
  pointer_type: 'coarse' | 'fine' | 'none';
};

const colorScheme = (): UserProperties['color_scheme'] => {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
};

const pointerType = (): UserProperties['pointer_type'] => {
  if (typeof window === 'undefined') return 'none';
  if (window.matchMedia('(pointer: fine)').matches) return 'fine';
  if (window.matchMedia('(pointer: coarse)').matches) return 'coarse';
  return 'none';
};

/**
 * Pure over the throw log for the game-derived counts; the device fields read
 * the current media queries at call time (mirrors `prefersReducedMotion`).
 * `throw_count` is already capped at 200 by the store's `MAX_WUERF`.
 */
export const buildUserProperties = (
  wurfbuech: WurfEintrag[],
): UserProperties => ({
  throw_count: wurfbuech.length,
  cantons_collected: gsammleteKantöne(wurfbuech).size,
  dart_skins_unlocked: PFYLSORTE.filter(s => wurfbuech.length >= s.abNWuerf)
    .length,
  color_scheme: colorScheme(),
  reduced_motion: prefersReducedMotion(),
  pointer_type: pointerType(),
});

/**
 * Sets the GA4 user properties by pushing them onto the GTM `dataLayer`, where
 * the container maps them onto the GA4 tag. Shares `track()`'s gating exactly:
 * no-ops (with a console trail) when analytics is disabled, respects Consent
 * Mode, and never touches `window` on the server.
 */
export const setUserProperties = (props: UserProperties): void => {
  if (!isAnalyticsEnabled) {
    console.debug('[analytics] user_properties', props);
    return;
  }

  if (resolveConsent().analytics_storage !== 'granted') return;

  if (typeof window === 'undefined') return;

  window.dataLayer ??= [];
  window.dataLayer.push({
    event: 'set_user_properties',
    user_properties: props,
  });
};
