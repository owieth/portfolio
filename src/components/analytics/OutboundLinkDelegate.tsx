'use client';

import { track } from '@/lib/analytics/track';
import {
  ANALYTICS_HANDLED_ATTR,
  isOutbound,
  linkFields,
} from '@/lib/analytics/links';
import { useEffect } from 'react';

/**
 * A document-level catch-all for outbound clicks. `/design` renders MDX fetched
 * from GitHub at request time, so its links are raw `<a>` elements that never
 * pass through `CustomLink` or the citation link — nothing else would track
 * them. React-handled anchors carry the handled marker and are skipped here, so
 * a normal outbound click fires exactly once.
 *
 * Renders nothing; it only attaches a single delegated listener for the app.
 */
const OutboundLinkDelegate = () => {
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest('a');

      if (!anchor) return;
      if (anchor.hasAttribute(ANALYTICS_HANDLED_ATTR)) return;
      if (!isOutbound(anchor.href, window.location.host)) return;

      track({
        name: 'outbound_click',
        ...linkFields(anchor.href, anchor.textContent ?? ''),
      });
    };

    document.addEventListener('click', handleClick);

    return () => document.removeEventListener('click', handleClick);
  }, []);

  return null;
};

export default OutboundLinkDelegate;
