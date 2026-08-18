'use client';

import { track } from '@/lib/analytics/track';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';

/**
 * Sends `page_view` from code on every App Router navigation, rather than
 * trusting GA4's history-change autotracking. This is deterministic and gets
 * `page_path` right on routes in the chrome-less `(fullscreen)` group such as
 * `/projects/wo-haere/play`.
 *
 * The GTM GA4 config tag must set `send_page_view: false` and GA4 Enhanced
 * Measurement's history-based page-change tracking must be off, or every
 * navigation is counted twice.
 */
const PageViewTrackerInner = () => {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const query = searchParams.toString();
    const page_path = query ? `${pathname}?${query}` : pathname;

    track({ name: 'page_view', page_path });
  }, [pathname, searchParams]);

  return null;
};

/**
 * `useSearchParams` opts a route into client-side rendering unless it sits under
 * a Suspense boundary, so the tracker is wrapped here to keep the rest of the
 * tree server-rendered.
 */
const PageViewTracker = () => (
  <Suspense fallback={null}>
    <PageViewTrackerInner />
  </Suspense>
);

export default PageViewTracker;
