import Footer from '@/components/Footer';
import Header from '@/components/Header';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';

const soehne = localFont({
  src: '../../public/fonts/soehne-buch.woff2',
  weight: '400',
  style: 'normal',
});

const title = 'Olivier Winkler - Portfolio';
const description = 'Crafting Software ✦ frigg.eco';

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    type: 'website',
    url: 'https://owieth.me',
    title,
    description,
    siteName: title,
    images: [
      {
        url: 'https://example.com/og.png',
      },
    ],
  },
  keywords: ['portfolio', 'olivier', 'olivier winkler', 'owieth', 'frigg.eco'],
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

  return (
    <html lang="en">
      <body className={`${GeistSans.variable} ${GeistMono.variable} font-sans`}>
        <Header />
        <main className={styles.main}>{children}</main>
        <Analytics />
        {/* <Dock /> */}
        <Footer />

        <SpeedInsights />
      </body>
    </html>
  );
}
