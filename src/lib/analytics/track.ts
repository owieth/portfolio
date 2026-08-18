import { isAnalyticsEnabled } from '@/lib/analytics/config';
import { resolveConsent } from '@/lib/analytics/consent';
import { isValidEvent, type AnalyticsEvent } from '@/lib/analytics/events';
import { isInternalTraffic } from '@/lib/analytics/internal-traffic';

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * The single entry point every layer uses to emit an event. It pushes to the
 * GTM `dataLayer`; GA4 is configured inside the container to read from there.
 *
 * No-ops in two cases, both by design:
 *   - analytics disabled (env unset) — logs to the console instead, so dev and
 *     CI produce a visible trail without a real container;
 *   - analytics consent not granted — respects the Consent Mode state machine.
 *
 * When it does fire it pushes exactly once, flattening the event's parameters
 * next to a GA4 `event` name.
 */
export const track = (event: AnalyticsEvent): void => {
  if (!isAnalyticsEnabled) {
    console.debug('[analytics]', event);
    return;
  }

  if (resolveConsent().analytics_storage !== 'granted') return;

  if (typeof window === 'undefined') return;

  if (process.env.NODE_ENV !== 'production' && !isValidEvent(event)) {
    console.warn(
      '[analytics] event exceeds GA4 limits, will be dropped',
      event,
    );
  }

  const { name, ...params } = event;

  window.dataLayer ??= [];
  window.dataLayer.push({
    event: name,
    ...params,
    ...(isInternalTraffic() && { traffic_type: 'internal' }),
  });
};
