import { PLAY_PATH } from '@/lib/wo-haere/routes';

export interface Screenshot {
  src: string;
  width: number;
  height: number;
  alt: string;
}

export interface ProjectLink {
  label: string;
  href: string;
}

export interface Project {
  slug: string;
  title: string;
  tagline: string;
  year: number;
  stack: string[];
  links: ProjectLink[];
  /** Landscape, please: the listing renders every cover full-width in one column. */
  cover: Screenshot;
  screenshots: Screenshot[];
}

/**
 * Screenshots live at /public/projects/<slug>-<name>.webp and are served at their
 * export size. Most shots in a project share one size, so it binds per project and
 * is overridden only for the odd one out — a menu bar popover is portrait where a
 * map is landscape.
 */
const shots =
  (slug: string, width: number, height: number) =>
  (
    name: string,
    alt: string,
    size?: { width: number; height: number },
  ): Screenshot => ({
    src: `/projects/${slug}-${name}.webp`,
    width: size?.width ?? width,
    height: size?.height ?? height,
    alt,
  });

const woHaere = shots('wo-haere', 1280, 800);

/** Array order is listing order — curated, not chronological. */
export const projects: Project[] = [
  {
    slug: 'wo-haere',
    title: 'Wo häre?',
    tagline:
      'Throw a dart at a map of Switzerland and let it decide where to go next.',
    year: 2026,
    stack: ['Next.js', 'MapLibre GL', 'swisstopo', 'Web Audio', 'Tailwind CSS'],
    links: [{ label: 'Play it', href: PLAY_PATH }],
    cover: woHaere(
      'charte',
      'The swisstopo Landeskarte with the dart ready to throw',
    ),
    // Ordered as the case study reads them, so the indices run down the page.
    screenshots: [
      woHaere(
        'result',
        'The result card after a throw landed in Val Bavona, Ticino, 1819 m above sea level and 108 km from Bern',
      ),
      woHaere(
        'globe',
        'The Wäutchugele view: a MapLibre globe projection with the landed dart marked over Switzerland',
      ),
      woHaere(
        'aim',
        'The aim overlay: a dashed flight path, a crosshair on the predicted landing spot and a dashed one-sigma ring, at 61% force',
      ),
      woHaere(
        'panel',
        'The settings panel showing the view and throw-style pickers, the canton stamp card and the throw log',
      ),
    ],
  },
];

export const getProject = (slug: string) =>
  projects.find(project => project.slug === slug);
