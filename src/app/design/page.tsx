import { MDXRemote } from 'next-mdx-remote/rsc';

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
