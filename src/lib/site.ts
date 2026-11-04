export const SITE_URL = 'https://olivierwinkler.ch';

/**
 * Last content change per static route, `YYYY-MM-DD`. Bump a date when its page
 * changes: Google only trusts lastmod that tracks real edits. Case studies carry
 * their own date in `@/data/projects`.
 */
export const ROUTE_LAST_MODIFIED = {
  '/': '2026-08-17',
  '/projects': '2026-09-27',
  '/stats': '2026-11-02',
  '/design': '2026-09-28',
  '/privacy': '2026-09-28',
} as const;
