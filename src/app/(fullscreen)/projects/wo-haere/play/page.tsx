import WoHaere from '@/components/wo-haere/WoHaere';
import { APP } from '@/lib/wo-haere/data/bern';
import { OG_ENDPOINT, PLAY_PATH } from '@/lib/wo-haere/routes';
import { formatWurf, parseWurf } from '@/lib/wo-haere/wurfParam';
import { SITE_URL } from '@/lib/site';
import type { Metadata, Viewport } from 'next';

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export const viewport: Viewport = {
  themeColor: '#1c1917',
  width: 'device-width',
  initialScale: 1,
  // The map fills the viewport, so pinch-zooming the page would fight panning.
  maximumScale: 1,
};

/**
 * Metadata merges shallowly — a nested object here replaces the parent's
 * wholesale rather than being merged into it. So openGraph and twitter have to
 * restate everything they want to keep from the root layout, and canonical has
 * to be declared or the page inherits the root's '/'.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const wurf = parseWurf((await searchParams).wurf);
  const bild = wurf ? `${OG_ENDPOINT}?wurf=${formatWurf(wurf)}` : OG_ENDPOINT;
  const title = APP.name;

  return {
    title,
    description: APP.beschrybig,
    alternates: {
      canonical: PLAY_PATH,
    },
    openGraph: {
      type: 'website',
      url: `${SITE_URL}${PLAY_PATH}`,
      siteName: 'Olivier Winkler',
      locale: 'gsw_CH',
      title,
      description: APP.tagline,
      images: [{ url: bild, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      creator: '@_owieth',
      title,
      description: APP.tagline,
      images: [bild],
    },
  };
}

export default async function PlayPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return <WoHaere startWurf={parseWurf((await searchParams).wurf)} />;
}
