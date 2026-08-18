'use client';

import { syncInternalTrafficFlag } from '@/lib/analytics/internal-traffic';
import {
  buildUserProperties,
  setUserProperties,
} from '@/lib/analytics/user-properties';
import { useWoHaere } from '@/lib/wo-haere/store';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';

/**
 * Keeps the two device-side analytics signals in sync, without any UI:
 *
 *   - the internal-traffic flag, toggled from the `?ow_internal` query param;
 *   - the GA4 user properties derived from the wo-haere throw log and device
 *     context, re-set whenever the throw log changes so counts grow live within
 *     a session.
 */
const UserPropertiesTrackerInner = () => {
  const searchParams = useSearchParams();
  const { wurfbuech } = useWoHaere();

  useEffect(() => {
    syncInternalTrafficFlag(searchParams.toString());
  }, [searchParams]);

  useEffect(() => {
    setUserProperties(buildUserProperties(wurfbuech));
  }, [wurfbuech]);

  return null;
};

/**
 * `useSearchParams` opts a route into client-side rendering unless it sits under
 * a Suspense boundary, so the tracker is wrapped here to keep the rest of the
 * tree server-rendered (mirrors `PageViewTracker`).
 */
const UserPropertiesTracker = () => (
  <Suspense fallback={null}>
    <UserPropertiesTrackerInner />
  </Suspense>
);

export default UserPropertiesTracker;
