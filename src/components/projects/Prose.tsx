import type { Screenshot } from '@/data/projects';
import Image from 'next/image';
import type { ReactNode } from 'react';

export const Section = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <section className="mt-16 flex flex-col gap-4">
    <h2 className="text-2xl font-medium text-balance">{title}</h2>
    {children}
  </section>
);

export const P = ({ children }: { children: ReactNode }) => (
  <p className="text-pretty text-muted">{children}</p>
);

/** Citations mid-sentence. Links that are calls to action belong in Project.links. */
export const A = ({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="border-b border-line transition-colors hover:border-foreground hover:text-foreground"
  >
    {children}
  </a>
);

export const Table = ({
  head,
  rows,
}: {
  head: string[];
  rows: ReactNode[][];
}) => (
  <div className="overflow-x-auto">
    <table className="w-full min-w-md border-collapse text-left text-sm">
      <thead>
        <tr className="border-b border-foreground/20">
          {head.map(cell => (
            <th key={cell} className="py-2 pr-4 font-medium">
              {cell}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="text-muted tabular-nums">
        {rows.map((row, i) => (
          <tr key={i} className="border-b border-foreground/10">
            {row.map((cell, j) => (
              <td key={j} className="py-2 pr-4 align-top">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const Shot = ({ shot }: { shot: Screenshot }) => (
  <figure className="mt-2 flex flex-col gap-2">
    <Image
      src={shot.src}
      width={shot.width}
      height={shot.height}
      alt={shot.alt}
      className="w-full rounded-lg border border-foreground/20"
    />
    <figcaption className="text-sm text-pretty text-muted">
      {shot.alt}
    </figcaption>
  </figure>
);
