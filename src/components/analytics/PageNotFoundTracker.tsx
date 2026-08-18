'use client';

import { track } from '@/lib/analytics/track';
import { useEffect } from 'react';

/**
 * Emits `page_not_found` for the URL that missed. The 404 boundary is a server
 * component, so this small client child reads the attempted path and referrer
 * from the browser and fires once on mount.
 */
const PageNotFoundTracker = () => {
  useEffect(() => {
    track({
      name: 'page_not_found',
      page_path: window.location.pathname + window.location.search,
      referrer: document.referrer,
    });
  }, []);

  return null;
};

export default PageNotFoundTracker;
