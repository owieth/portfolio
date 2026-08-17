/**
 * Consent Mode v2 state machine.
 *
 * Swiss revDSG asks for transparency, not prior opt-in, so the defaults are
 * granted for the categories this site actually uses. The site runs GA4 only
 * and shows no ads, so the ad_* categories stay denied — nothing would consume
 * that consent anyway.
 *
 * A browser-level privacy signal (Global Privacy Control or Do Not Track)
 * overrides everything and forces all categories to denied. Otherwise a
 * first-party `ow_consent` cookie remembers a prior choice; absent that, the
 * granted defaults apply.
 *
 * The `ConsentBootstrap` inline script re-implements `resolveConsent` in plain
 * JS (it cannot import this module), so the category shapes below are the single
 * source of truth it serializes — keep them plain JSON-serialisable objects.
 */
export type ConsentValue = 'granted' | 'denied';

export type ConsentState = {
  ad_storage: ConsentValue;
  ad_user_data: ConsentValue;
  ad_personalization: ConsentValue;
  analytics_storage: ConsentValue;
  functionality_storage: ConsentValue;
  personalization_storage: ConsentValue;
  security_storage: ConsentValue;
};

export const GRANTED_DEFAULT: ConsentState = {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: 'granted',
  functionality_storage: 'granted',
  personalization_storage: 'granted',
  security_storage: 'granted',
};

export const ALL_DENIED: ConsentState = {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: 'denied',
  functionality_storage: 'denied',
  personalization_storage: 'denied',
  security_storage: 'denied',
};

export const CONSENT_COOKIE = 'ow_consent';

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export const readConsentCookie = (): ConsentState | null => {
  if (typeof document === 'undefined') return null;

  const match = document.cookie
    .split('; ')
    .find(row => row.startsWith(`${CONSENT_COOKIE}=`));
  if (!match) return null;

  try {
    return JSON.parse(decodeURIComponent(match.slice(CONSENT_COOKIE.length + 1)));
  } catch {
    // A tampered or truncated cookie is treated as absent rather than throwing.
    return null;
  }
};

export const writeConsentCookie = (state: ConsentState): void => {
  if (typeof document === 'undefined') return;

  const value = encodeURIComponent(JSON.stringify(state));
  document.cookie = `${CONSENT_COOKIE}=${value}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
};

/**
 * A browser privacy signal is a legally binding opt-out; it wins over the cookie
 * and the defaults alike.
 */
export const isPrivacySignalOn = (): boolean => {
  if (typeof navigator === 'undefined') return false;

  return (
    (navigator as Navigator & { globalPrivacyControl?: boolean })
      .globalPrivacyControl === true || navigator.doNotTrack === '1'
  );
};

export const resolveConsent = (): ConsentState => {
  if (isPrivacySignalOn()) return ALL_DENIED;

  return readConsentCookie() ?? GRANTED_DEFAULT;
};
