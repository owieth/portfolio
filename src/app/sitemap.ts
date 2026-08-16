import { projects } from '@/data/projects';
import { SITE_LAST_MODIFIED, SITE_URL } from '@/lib/site';
import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: SITE_LAST_MODIFIED,
      changeFrequency: 'monthly',
      priority: 1,
    },
    {
      url: `${SITE_URL}/projects`,
      lastModified: SITE_LAST_MODIFIED,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    // Case studies only. A project's own interactive route — /projects/wo-haere/play
    // — is the thing itself rather than a document, so there is nothing stable on it
    // to index. `as const` is load-bearing: the return-type annotation does not reach
    // through a spread into .map(), so the literal would otherwise widen to string.
    ...projects.map(project => ({
      url: `${SITE_URL}/projects/${project.slug}`,
      lastModified: SITE_LAST_MODIFIED,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
    {
      url: `${SITE_URL}/design`,
      lastModified: SITE_LAST_MODIFIED,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
  ];
}
