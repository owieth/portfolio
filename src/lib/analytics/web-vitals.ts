import { track } from '@/lib/analytics/track';
import type { useReportWebVitals } from 'next/web-vitals';

export type WebVitalsMetric = Parameters<
  Parameters<typeof useReportWebVitals>[0]
>[0];

let landingPath: string | undefined;

/**
 * The `useReportWebVitals` callback. It lives at module level so its reference
 * never changes: Next re-registers every web-vitals observer whenever the
 * callback changes, and the observers replay buffered entries, so a new
 * callback per render re-reports the landing page's metrics on every client
 * navigation.
 *
 * Every metric is labelled with the landing path, not the current route.
 * FCP, TTFB and LCP describe only the hard load, and CLS and INP accumulate
 * across soft navigations, so the document that was measured is the only
 * consistent label.
 *
 * GA4 metrics are integers, so values are rounded and CLS is scaled by 1000 —
 * an unscaled CLS of `0.07` would otherwise land as `0`.
 */
export const reportWebVital = (metric: WebVitalsMetric): void => {
  landingPath ??= window.location.pathname;

  const metric_value =
    metric.name === 'CLS'
      ? Math.round(metric.value * 1000)
      : Math.round(metric.value);

  track({
    name: 'web_vitals',
    metric_name: metric.name,
    metric_value,
    metric_rating: metric.rating,
    metric_id: metric.id,
    page_path: landingPath,
  });
};
