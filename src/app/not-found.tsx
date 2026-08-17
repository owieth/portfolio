import SiteChrome from '@/components/SiteChrome';
import Link from 'next/link';

/**
 * Unmatched URLs always resolve at the root boundary, outside the (site) route
 * group — so the chrome has to be applied here explicitly. A (site)/not-found
 * would never be reached for an arbitrary bad URL.
 */
export default function NotFound() {
  return (
    <SiteChrome>
      <div className="flex flex-col items-center gap-4">
        <h1 className="text-4xl font-medium">404</h1>
        <p className="text-muted">This page could not be found.</p>
        <Link
          href="/"
          className="border-line text-muted hover:border-foreground hover:text-foreground border-b transition-colors"
        >
          Go back home
        </Link>
      </div>
    </SiteChrome>
  );
}
