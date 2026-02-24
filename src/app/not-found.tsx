import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-4">
      <h1 className="text-4xl font-medium">404</h1>
      <p className="text-white/50">This page could not be found.</p>
      <Link
        href="/"
        className="border-b border-white/50 text-white/50 transition-colors hover:border-white hover:text-white"
      >
        Go back home
      </Link>
    </div>
  );
}
