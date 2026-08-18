'use client';

import { track } from '@/lib/analytics/track';
import { usePathname } from 'next/navigation';
import { useReportWebVitals } from 'next/web-vitals';

/**
 * Copies each Core Web Vital into GA4 as a `web_vitals` event. `<SpeedInsights />`
 * stays the source of record; this copy adds segmentation — a regression can be
 * traced to a route, device class or referrer inside GA4, next to the
 * behavioural events.
 *
 * GA4 metrics are integers, so values are rounded and CLS is scaled by 1000 —
 * an unscaled CLS of `0.07` would otherwise land as `0`.
 */
const WebVitalsTracker = () => {
  const pathname = usePathname();

  useReportWebVitals(metric => {
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
      page_path: pathname,
    });
  });

  return null;
};

export default WebVitalsTracker;
