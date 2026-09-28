import localFont from 'next/font/local';

/**
 * Latin and Greek subsets of `geist` 1.7.2's `Geist-Variable.woff2` and
 * `Geist-Italic[wght].woff2`, made with fontTools 4.66.0 and brotli 1.2.0.
 * After a `geist` bump, re-run from the package files, not the committed ones:
 *
 *   U='U+0020-007E,U+00A0-024F,U+0370-03FF,U+2000-206F,U+20A0-20BF,U+2100-23FF'
 *   pyftsubset node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2 \
 *     --unicodes="$U" --layout-features='*' --flavor=woff2 \
 *     --output-file=src/app/fonts/Geist-Variable.woff2
 *   pyftsubset 'node_modules/geist/dist/fonts/geist-sans/Geist-Italic[wght].woff2' \
 *     --unicodes="$U" --layout-features='*' --flavor=woff2 \
 *     --output-file=src/app/fonts/Geist-Italic-Variable.woff2
 */
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
  preload: false,
});
