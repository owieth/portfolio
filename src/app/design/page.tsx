import type { Metadata } from 'next';
import { MDXRemote } from 'next-mdx-remote/rsc';

export const metadata: Metadata = {
  title: 'Design',
  description:
    'Design resources and guidelines by Olivier Winkler. A collection of design principles and visual references.',
  alternates: {
    canonical: '/design',
  },
};

export default async function DesignPage() {
  const res = await fetch(
    'https://raw.githubusercontent.com/owieth/designs/main/README.md',
  );
  const markdown = await res.text();

  return (
    <div className="flex flex-col justify-start">
      <MDXRemote source={markdown} />
    </div>
  );
}
