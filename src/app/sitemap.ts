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
      url: `${SITE_URL}/design`,
      lastModified: SITE_LAST_MODIFIED,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
  ];
}
