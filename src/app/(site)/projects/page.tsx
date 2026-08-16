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
      <p className="mt-4 text-pretty text-muted">
        Things I have built, with a write-up of how they work.
      </p>

      <ul className="mt-12 flex flex-col gap-12">
        {projects.map(project => (
          <li key={project.slug}>
            <Link href={project.href} className="group block">
              <Image
                src={project.cover.src}
                width={project.cover.width}
                height={project.cover.height}
                alt={project.cover.alt}
                className="w-full rounded-lg border border-foreground/20 transition-colors group-hover:border-foreground/50"
                priority
              />
              <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-2xl font-medium">{project.title}</h2>
                <span className="text-sm text-muted tabular-nums">
                  {project.year}
                </span>
              </div>
              <p className="mt-1 text-pretty text-muted">
                {project.tagline}
              </p>
              <p className="mt-3 text-sm text-muted">
                {project.stack.join(' · ')}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
