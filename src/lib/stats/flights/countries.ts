import type { Country } from '@/lib/stats/flights/types';

/**
 * The eleven countries the log reaches, ISO 3166-1 alpha-2 to the name.
 *
 * The names are copied from `airports.ts` rather than taken from a locale
 * package. `Intl.DisplayNames` would answer `United States` today and whatever
 * CLDR says tomorrow, and the two sides have to stay joinable by string — the
 * test in `airports.test.ts` compares a resolved name against the `country`
 * sitting beside the code, which is what catches an entry whose two halves
 * disagree.
 *
 * `GB`, not `UK`. The alpha-2 code for the United Kingdom is `GB`; `UK` is an
 * exceptional reservation and not a code, and a flag file named after it would
 * not resolve.
 *
 * Same `as const satisfies` as the airports: `satisfies` rejects a malformed
 * entry where it is written, `as const` keeps the keys literal.
 */
export const COUNTRIES = {
  CH: { code: 'CH', name: 'Switzerland' },
  FR: { code: 'FR', name: 'France' },
  GB: { code: 'GB', name: 'United Kingdom' },
  NO: { code: 'NO', name: 'Norway' },
  US: { code: 'US', name: 'United States' },
  AT: { code: 'AT', name: 'Austria' },
  GR: { code: 'GR', name: 'Greece' },
  NL: { code: 'NL', name: 'Netherlands' },
  ES: { code: 'ES', name: 'Spain' },
  PT: { code: 'PT', name: 'Portugal' },
  DE: { code: 'DE', name: 'Germany' },
} as const satisfies Record<string, Country>;

export type CountryCode = keyof typeof COUNTRIES;

/**
 * Null for a code the registry does not know, and `Object.hasOwn` rather than
 * `in` for the same reason as `airport()` — `in` walks the prototype chain.
 */
export const country = (code: string): Country | null =>
  Object.hasOwn(COUNTRIES, code) ? COUNTRIES[code as CountryCode] : null;
