import localFont from 'next/font/local';

export const GeistSans = localFont({
  src: [
    {
      path: './fonts/Geist-Variable.woff2',
      weight: '100 900',
      style: 'normal',
    },
    {
      path: './fonts/Geist-Italic-Variable.woff2',
      weight: '100 900',
      style: 'italic',
    },
  ],
  variable: '--font-geist-sans',
});
