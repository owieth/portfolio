export interface Screenshot {
  src: string;
  width: number;
  height: number;
  alt: string;
}

export interface Project {
  slug: string;
  title: string;
  tagline: string;
  year: number;
  stack: string[];
  href: string;
  links: { label: string; href: string }[];
  cover: Screenshot;
  screenshots: Screenshot[];
}

const shot = (name: string, alt: string): Screenshot => ({
  src: `/projects/wo-haere-${name}.webp`,
  width: 1280,
  height: 800,
  alt,
});

export const projects: Project[] = [
  {
    slug: 'wo-haere',
    title: 'Wo häre?',
    tagline:
      'Throw a dart at a map of Switzerland and let it decide where to go next.',
    year: 2026,
    stack: ['Next.js', 'MapLibre GL', 'swisstopo', 'Web Audio', 'Tailwind CSS'],
    href: '/projects/wo-haere',
    links: [{ label: 'Play it', href: '/projects/wo-haere/play' }],
    cover: shot(
      'charte',
      'The swisstopo Landeskarte with the dart ready to throw',
    ),
    screenshots: [
      shot(
        'aim',
        'The aim overlay: a dashed flight path, a crosshair on the predicted landing spot and a dashed one-sigma ring, at 61% force',
      ),
      shot(
        'result',
        'The result card after a throw landed in Val Bavona, Ticino, 1819 m above sea level and 108 km from Bern',
      ),
      shot(
        'globe',
        'The Wäutchugele view: a MapLibre globe projection with the landed dart marked over Switzerland',
      ),
      shot(
        'panel',
        'The settings panel showing the view and throw-style pickers, the canton stamp card and the throw log',
      ),
    ],
  },
];

export const getProject = (slug: string) =>
  projects.find(project => project.slug === slug);
