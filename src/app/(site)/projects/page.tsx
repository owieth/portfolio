import { projects } from '@/data/projects';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Projects',
  description:
    'Things Olivier Winkler has built — write-ups, screenshots and, where it makes sense, something you can actually play with.',
  alternates: {
    canonical: '/projects',
  },
};

export default function ProjectsPage() {
  return (
    <div className="w-full max-w-3xl">
      <h1 className="text-4xl font-medium text-balance italic sm:text-5xl">
        Projects
      </h1>
      <p className="text-muted mt-4 text-pretty">
        Things I have built, with a write-up of how they work.
      </p>

      <ul className="mt-12 flex flex-col gap-12">
        {projects.map((project, index) => (
          <li key={project.slug}>
            <Link href={`/projects/${project.slug}`} className="group block">
              <Image
                src={project.cover.src}
                width={project.cover.width}
                height={project.cover.height}
                alt={project.cover.alt}
                className="border-foreground/20 group-hover:border-foreground/50 w-full rounded-lg border transition-colors"
                // Only the first cover is above the fold; preloading the rest
                // just makes them compete for the same connection.
                priority={index === 0}
              />
              <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-2xl font-medium">{project.title}</h2>
                <span className="text-muted text-sm tabular-nums">
                  {project.year}
                </span>
              </div>
              <p className="text-muted mt-1 text-pretty">{project.tagline}</p>
              <p className="text-muted mt-3 text-sm">
                {project.stack.join(' · ')}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
