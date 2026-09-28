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

export const GeistMono = localFont({
  src: './fonts/GeistMono-Variable.woff2',
  variable: '--font-geist-mono',
  adjustFontFallback: false,
  fallback: [
    'ui-monospace',
    'SFMono-Regular',
    'Roboto Mono',
    'Menlo',
    'Monaco',
    'Liberation Mono',
    'DejaVu Sans Mono',
    'Courier New',
    'monospace',
  ],
  weight: '100 900',
});
