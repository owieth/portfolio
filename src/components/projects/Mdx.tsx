import { A, P, Section, Shot as ProseShot } from '@/components/projects/Prose';
import type { Project } from '@/data/projects';
import type { ComponentProps, ReactNode } from 'react';

/**
 * The element map handed to MDXRemote for the case studies.
 *
 * Every className here is the one the hand-written JSX carried before the prose
 * moved into `src/content/projects`, so the rendered markup is unchanged. The
 * row borders sit on `[&>tr]:` variants because a GFM table gives thead and
 * tbody the same `tr` element and they need different weights.
 */

/** Every link in a case study is an outbound citation, so they all get `A`. */
const Anchor = ({ href, children }: ComponentProps<'a'>) =>
  href ? <A href={href}>{children}</A> : <>{children}</>;

const Strong = ({ children }: { children?: ReactNode }) => (
  <strong className="text-foreground font-medium">{children}</strong>
);

const Ul = ({ children }: { children?: ReactNode }) => (
  <ul className="text-muted marker:text-foreground/30 flex list-disc flex-col gap-2 pl-5 text-pretty">
    {children}
  </ul>
);

const Table = ({ children }: { children?: ReactNode }) => (
  <div className="overflow-x-auto">
    <table className="w-full min-w-md border-collapse text-left text-sm">
      {children}
    </table>
  </div>
);

const Thead = ({ children }: { children?: ReactNode }) => (
  <thead className="[&>tr]:border-foreground/20 [&>tr]:border-b">
    {children}
  </thead>
);

const Tbody = ({ children }: { children?: ReactNode }) => (
  <tbody className="text-muted [&>tr]:border-foreground/10 tabular-nums [&>tr]:border-b">
    {children}
  </tbody>
);

const Th = ({ children }: { children?: ReactNode }) => (
  <th className="py-2 pr-4 font-medium">{children}</th>
);

const Td = ({ children }: { children?: ReactNode }) => (
  <td className="py-2 pr-4 align-top">{children}</td>
);

/**
 * Screenshots are addressed by their index in `project.screenshots` so the MDX
 * never has to reach for the project record itself.
 *
 * The index arrives as a string because next-mdx-remote strips every JavaScript
 * expression from the source by default — `n={0}` would be dropped, `n="0"`
 * survives. Keeping that default on means the content files stay pure prose.
 */
const shotAt = (project: Project, n: string) => {
  const shot = project.screenshots[Number(n)];
  if (!shot) throw new Error(`${project.slug}: no screenshot at index ${n}`);
  return shot;
};

export const mdxComponents = (project: Project) => ({
  p: P,
  a: Anchor,
  strong: Strong,
  ul: Ul,
  table: Table,
  thead: Thead,
  tbody: Tbody,
  th: Th,
  td: Td,
  Section,
  Shot: ({ n }: { n: string }) => <ProseShot shot={shotAt(project, n)} />,
  /**
   * The popover is ~400pt wide, so it is capped near its captured width. The
   * dashboard-window shots are already about the column width and use Shot
   * directly.
   */
  Popover: ({ n }: { n: string }) => (
    <div className="mx-auto w-full max-w-md">
      <ProseShot shot={shotAt(project, n)} />
    </div>
  ),
});
