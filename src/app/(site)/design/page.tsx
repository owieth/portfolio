import type { Metadata } from 'next';
import { MDXRemote } from 'next-mdx-remote/rsc';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';

import { trackServer } from '@/lib/analytics/server/track-server';

export const metadata: Metadata = {
  title: 'Design',
  description:
    'Design resources and guidelines by Olivier Winkler. A collection of design principles and visual references.',
  alternates: {
    canonical: '/design',
  },
};

export default async function DesignPage() {
  // Reading the cookie attaches the failure event to the visitor's session, at
  // the cost of opting the page render out of ISR; the GitHub fetch below keeps
  // its own `revalidate` cache regardless.
  const cookieHeader = (await cookies()).toString();

  const res = await fetch(
    'https://raw.githubusercontent.com/owieth/designs/main/README.md',
    { next: { revalidate: 3600 } },
  );

  if (!res.ok) {
    trackServer(
      { name: 'design_fetch_failed_server', status: res.status },
      cookieHeader,
    );
    notFound();
  }

  const markdown = await res.text();

  return (
    <div className="flex flex-col justify-start">
      <MDXRemote source={markdown} />
    </div>
  );
}
