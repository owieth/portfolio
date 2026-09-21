import { country } from '@/lib/stats/flights/countries';

/**
 * Where the flag for a country is served from.
 *
 * The files in `public/flags` are the `3x2` set of `country-flag-icons`
 * v1.6.20, copied in byte for byte rather than depended on: the eleven come to
 * 4,655 bytes, which is less than the package and one less thing to keep
 * current. MIT, Copyright (c) 2020 @catamphetamine — carrying the notice is the
 * licence's one condition, and this docblock is where it lives so the files
 * themselves stay identical to upstream.
 *
 * Not emoji. The two-regional-indicator trick needs the OS emoji font to carry
 * flag ligatures, Windows' Segoe UI Emoji still does not, and Chromium hands
 * emoji to the OS font — so Chrome, Edge, Brave and Opera on Windows would draw
 * a `CH` letterbox where the flag should be.
 *
 * The path is derived rather than tabulated, so there is nothing to keep in
 * step with `COUNTRIES`. What guarantees the file is actually there is
 * `flags.test.ts`, which reads the directory.
 */
export const flagSrc = (code: string): string | null =>
  country(code) ? `/flags/${code}.svg` : null;
