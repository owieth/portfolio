'use client';

import { track } from '@/lib/analytics/track';
import { handledMarker, linkFields } from '@/lib/analytics/links';
import { MouseEvent, ReactNode } from 'react';

/**
 * Citations mid-sentence. Links that are calls to action belong in Project.links.
 *
 * Split out of Prose so this single anchor can own the `'use client'` boundary
 * and emit `citation_click` on click, while Prose's other elements stay server
 * components. The handled marker keeps the document delegate from re-counting it.
 */
export const A = ({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) => {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    const anchor = event.currentTarget;

    track({
      name: 'citation_click',
      ...linkFields(anchor.href, anchor.textContent ?? ''),
    });
  };

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="border-line hover:border-foreground hover:text-foreground border-b transition-colors"
      onClick={handleClick}
      {...handledMarker}
    >
      {children}
    </a>
  );
};
