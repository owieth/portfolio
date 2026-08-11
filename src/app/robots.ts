import { SITE_URL } from '@/lib/site';
import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      // The OG route is allowed explicitly: facebookexternalhit respects
      // robots.txt, so a blanket /api/ disallow would kill link previews for
      // shared throws.
      allow: ['/', '/api/wo-haere/og'],
      disallow: ['/api/'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
