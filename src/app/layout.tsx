import Footer from '@/components/Footer';
import Header from '@/components/Header';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import type { Metadata, Viewport } from 'next';
import './globals.css';

const SITE_URL = 'https://owieth.me';
const title = 'Olivier Winkler — Software Engineer';
const description =
  'Software Engineer building products for the future. Creator of frigg.eco — sustainable technology for a better world.';

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
  const styles = {
    main: [
      'relative',
      'flex',
      'min-h-[85vh]',
      'flex-col',
      'items-center',
      'justify-center',
      'p-24',
    ].join(' '),
  };

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
        jobTitle: 'Software Engineer',
        sameAs: [
          'https://github.com/owieth',
          'https://www.linkedin.com/in/olivier-winkler/',
          'https://twitter.com/_owieth',
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
        <Header />
        <main className={styles.main}>{children}</main>
        <Analytics />
        <Footer />
        <SpeedInsights />
      </body>
    </html>
  );
}
