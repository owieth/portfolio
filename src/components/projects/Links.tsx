import type { ProjectLink } from '@/data/projects';
import IconLink from '@/icons/Link';
import Link from 'next/link';

/**
 * Never prefetches. An internal project link points at that project's interactive
 * build, and /projects/wo-haere/play pulls ~250KB gz of maplibre onto a page that
 * is mostly prose — a hover would do exactly what prefetch does. Absolute URLs
 * ignore the prop, so it is unconditional rather than a field on ProjectLink.
 */
const ProjectLinks = ({
  links,
  className,
}: {
  links: ProjectLink[];
  className?: string;
}) => (
  <ul className={`flex flex-wrap gap-2 ${className || ''}`}>
    {links.map(({ label, href }) => {
      const isExternal = href.startsWith('http');

      return (
        <li key={href}>
          <Link
            href={href}
            prefetch={false}
            target={isExternal ? '_blank' : undefined}
            rel={isExternal ? 'noopener noreferrer' : undefined}
            className="inline-flex w-fit items-center gap-1.5 rounded-md border border-line px-4 py-2 text-sm transition-colors hover:border-foreground hover:bg-foreground hover:text-background"
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
