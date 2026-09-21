import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { MDXRemote } from 'next-mdx-remote/rsc';
import Image from 'next/image';
import remarkGfm from 'remark-gfm';

import { mdxComponents } from '@/components/projects/Mdx';
import ProjectLinks from '@/components/projects/Links';
import { P } from '@/components/projects/Prose';
import type { Project } from '@/data/projects';
import type { ReactNode } from 'react';

interface CaseStudyProps {
  project: Project;
  /**
   * The italic line under the title. Deliberately not `project.tagline` — that
   * one is the listing's English summary, this one is written in the project's
   * own voice.
   */
  tagline: ReactNode;
  intro: ReactNode;
}

const CONTENT_DIR = path.join(process.cwd(), 'src/content/projects');

/**
 * The frame every case study shares: title, tagline, intro, stack, links, the
 * cover shot, then the prose from `src/content/projects/<slug>.mdx`.
 *
 * The prose lives in MDX rather than JSX because these pages are 300-500 lines
 * of writing with a handful of components in them, and a page file that long is
 * neither readable nor reviewable.
 */
export default async function CaseStudy({
  project,
  tagline,
  intro,
}: CaseStudyProps) {
  const source = await readFile(
    path.join(CONTENT_DIR, `${project.slug}.mdx`),
    'utf8',
  );

  return (
    <article className="w-full max-w-3xl">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-4xl font-medium text-balance italic sm:text-5xl">
            {project.title}
          </h1>
          <span className="text-muted text-sm tabular-nums">
            {project.year}
          </span>
        </div>
        <p className="text-muted text-pretty italic">{tagline}</p>
        <P>{intro}</P>
        <p className="text-muted text-sm">{project.stack.join(' · ')}</p>
        <ProjectLinks
          links={project.links}
          slug={project.slug}
          className="mt-2"
        />
      </header>

      <Image
        src={project.cover.src}
        width={project.cover.width}
        height={project.cover.height}
        alt={project.cover.alt}
        className="border-foreground/20 mt-12 w-full rounded-lg border"
        priority
      />

      <MDXRemote
        source={source}
        components={mdxComponents(project)}
        options={{ mdxOptions: { remarkPlugins: [remarkGfm] } }}
      />

      <div className="border-foreground/20 mt-16 border-t pt-8">
        <ProjectLinks links={project.links} slug={project.slug} />
      </div>
    </article>
  );
}
