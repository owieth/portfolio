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
const macVitals = shots('macvitals', 1280, 800);

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
  {
    slug: 'macvitals',
    title: 'MacVitals',
    tagline:
      'A menu bar system monitor that reads its numbers straight out of Mach and the SMC.',
    year: 2026,
    stack: ['Swift 6', 'SwiftUI', 'AppKit', 'IOKit', 'Mach', 'No dependencies'],
    links: [
      // /releases/latest, never a versioned asset URL: a pinned one 404s the
      // moment the next release ships.
      {
        label: 'Download',
        href: 'https://github.com/owieth/MacVitals/releases/latest',
      },
      { label: 'Source', href: 'https://github.com/owieth/MacVitals' },
    ],
    // The popover is 444pt wide, so these are shown at their captured size
    // rather than stretched across the column.
    cover: macVitals(
      'popover',
      'The MacVitals popover on its Dashboard tab: uptime, rings for CPU, memory and GPU, and rolling charts underneath',
    ),
    screenshots: [
      macVitals(
        'cpu',
        'Total CPU split into user and system, a bar per core, and memory broken into active, wired and compressed',
        { width: 444, height: 532 },
      ),
      macVitals(
        'sensors',
        'The Sensors tab: temperature keys the app discovered on this machine, grouped under CPU and shown by their raw four-character SMC names because no label was found for them',
        { width: 453, height: 606 },
      ),
      macVitals(
        'processes',
        'The Processes tab, sorted by CPU, with per-process usage derived from the delta of proc_pidinfo user and system nanoseconds',
        { width: 445, height: 604 },
      ),
      macVitals(
        'battery',
        'Battery, network, GPU and thermals — including the battery health figure reading 1%, and a fan section reporting 0 RPM at 51 °C. The MAC address is pixelated out',
        { width: 444, height: 554 },
      ),
    ],
  },
];

export const getProject = (slug: string) =>
  projects.find(project => project.slug === slug);
