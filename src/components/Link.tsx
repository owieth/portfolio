'use client';

import IconLink from '@/icons/Link';
import { track } from '@/lib/analytics/track';
import { handledMarker, linkFields } from '@/lib/analytics/links';
import Link from 'next/link';
import { MouseEvent, ReactNode } from 'react';

/**
 * The content-link chokepoint: home page and footer route through here, so it is
 * the natural place to emit link-click events. `nav` flips the emitted event to
 * `nav_click` for the footer's primary navigation; every other link is an
 * `outbound_click` or `internal_link_click`. Each click is stamped with the
 * handled marker so the document delegate does not re-count it.
 */
const CustomLink = ({
  link,
  children,
  className,
  nav,
}: {
  link: string;
  children: ReactNode;
  className?: string;
  nav?: boolean;
}) => {
  const isExternal = link.startsWith('http');

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    const anchor = event.currentTarget;
    const fields = linkFields(anchor.href, anchor.textContent ?? '');

    if (nav) {
      track({
        name: 'nav_click',
        link_url: fields.link_url,
        link_text: fields.link_text,
        nav_location: 'footer',
      });
      return;
    }

    track({
      name: isExternal ? 'outbound_click' : 'internal_link_click',
      ...fields,
    });
  };

  const styles = {
    link: [
      'group',
      'inline-flex',
      'w-fit',
      'items-center',
      'gap-1',
      'border-b',
      'border-transparent',
      'text-muted',
      'transition-colors',
      'ease-in-out',
      'hover:border-foreground hover:text-foreground',
    ].join(' '),
  };

  return (
    <Link
      href={link}
      className={`${styles.link} ${className || ''}`}
      target={isExternal ? '_blank' : '_self'}
      rel={isExternal ? 'noopener noreferrer' : undefined}
      onClick={handleClick}
      {...handledMarker}
    >
      {children}
      {isExternal && <IconLink />}
    </Link>
  );
};

export default CustomLink;
