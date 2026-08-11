import { SITE_URL } from '@/lib/site';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { GeistMono } from 'geist/font/mono';
import type { Metadata, Viewport } from 'next';
import { GeistSans } from './fonts';
import './globals.css';

const title = 'Olivier Winkler — Software Engineer';
const description =
  'Software Engineer building products for the future. Building frigg.eco — sustainable technology for a better world.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: title,
    template: '%s | Olivier Winkler',
  },
  description,
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    url: SITE_URL,
    title,
    description,
    siteName: 'Olivier Winkler',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    creator: '@_owieth',
    title,
    description,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export const viewport: Viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: SITE_URL,
        name: 'Olivier Winkler',
        description,
      },
      {
        '@type': 'Person',
        '@id': `${SITE_URL}/#person`,
        name: 'Olivier Winkler',
        url: SITE_URL,
        // No `image`: Next 16.3 gives metadata image routes a content-hashed
        // pathname, so /opengraph-image is not a real URL and cannot be
        // hardcoded here.
        jobTitle: 'Software Engineer',
        worksFor: {
          '@type': 'Organization',
          name: 'frigg.eco',
          url: 'https://frigg.eco',
        },
        sameAs: [
          'https://github.com/owieth',
          'https://www.linkedin.com/in/olivier-winkler/',
          'https://twitter.com/_owieth',
          'https://frigg.eco',
        ],
      },
    ],
  };

  return (
    <html lang="en">
      <body className={`${GeistSans.variable} ${GeistMono.variable} font-sans`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
