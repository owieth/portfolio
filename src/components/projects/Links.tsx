'use client';

import type { ProjectLink } from '@/data/projects';
import IconLink from '@/icons/Link';
import { track } from '@/lib/analytics/track';
import { handledMarker } from '@/lib/analytics/links';
import Link from 'next/link';

/**
 * Never prefetches. An internal project link points at that project's interactive
 * build, and /projects/wo-haere/play pulls ~250KB gz of maplibre onto a page that
 * is mostly prose — a hover would do exactly what prefetch does. Absolute URLs
 * ignore the prop, so it is unconditional rather than a field on ProjectLink.
 *
 * Every button is a `project_cta_click`; a `Download` label additionally emits
 * `download_click`, since the release buttons are the site's only downloads.
 */
const ProjectLinks = ({
  links,
  slug,
  className,
}: {
  links: ProjectLink[];
  slug: string;
  className?: string;
}) => (
  <ul className={`flex flex-wrap gap-2 ${className || ''}`}>
    {links.map(({ label, href }) => {
      const isExternal = href.startsWith('http');

      const handleClick = () => {
        track({
          name: 'project_cta_click',
          project_slug: slug,
          cta_label: label,
        });

        if (label === 'Download') {
          track({ name: 'download_click', project_slug: slug, link_url: href });
        }
      };

      return (
        <li key={href}>
          <Link
            href={href}
            prefetch={false}
            target={isExternal ? '_blank' : undefined}
            rel={isExternal ? 'noopener noreferrer' : undefined}
            className="border-line hover:border-foreground hover:bg-foreground hover:text-background inline-flex w-fit items-center gap-1.5 rounded-md border px-4 py-2 text-sm transition-colors"
            onClick={handleClick}
            {...handledMarker}
          >
            {label}
            {isExternal ? <IconLink /> : <span aria-hidden="true">→</span>}
          </Link>
        </li>
      );
    })}
  </ul>
);

export default ProjectLinks;
