'use client';

import { reportWebVital } from '@/lib/analytics/web-vitals';
import { useReportWebVitals } from 'next/web-vitals';

/**
 * Copies each Core Web Vital into GA4 as a `web_vitals` event. `<SpeedInsights />`
 * stays the source of record; this copy adds segmentation — a regression can be
 * traced to a route, device class or referrer inside GA4, next to the
 * behavioural events.
 */
const WebVitalsTracker = () => {
  useReportWebVitals(reportWebVital);

  return null;
};

export default WebVitalsTracker;
