/**
 * Internal-traffic tagging. On a low-traffic personal site the owner's own
 * visits otherwise dominate every number, and there's no reliable IP filter
 * (home IP breaks on mobile data). So the owner marks their own device once:
 * visiting `?ow_internal=1` sets a localStorage flag, after which `track()`
 * attaches `traffic_type: 'internal'` to every event and GA4's built-in
 * internal-traffic data filter can exclude them. `?ow_internal=0` clears it.
 *
 * The flag is mirrored into an `ow_internal` cookie because server-side
 * Measurement Protocol events never see localStorage — the cookie rides along
 * on same-origin requests so the server can tag its events too. localStorage
 * stays the client's source of truth.
 */
const INTERNAL_TRAFFIC_KEY = 'ow_internal';
const INTERNAL_TRAFFIC_PARAM = 'ow_internal';
export const INTERNAL_TRAFFIC_COOKIE = 'ow_internal';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

const writeInternalTrafficCookie = (maxAge: number): void => {
  if (typeof document === 'undefined') return;

  document.cookie = `${INTERNAL_TRAFFIC_COOKIE}=1; path=/; max-age=${maxAge}; SameSite=Lax`;
};

/**
 * Reads the `ow_internal` query param and toggles the persisted flag: `1` sets,
 * `0` clears, anything else (including absence) leaves it untouched — so a plain
 * navigation never disturbs a device that was already marked. A marked device
 * re-mirrors the flag into the cookie on every call, so devices marked before
 * the cookie existed pick it up and its expiry keeps rolling forward.
 */
export const syncInternalTrafficFlag = (search: string): void => {
  if (typeof window === 'undefined') return;

  const value = new URLSearchParams(search).get(INTERNAL_TRAFFIC_PARAM);

  try {
    if (value === '1') {
      window.localStorage.setItem(INTERNAL_TRAFFIC_KEY, '1');
      writeInternalTrafficCookie(COOKIE_MAX_AGE_SECONDS);
    } else if (value === '0') {
      window.localStorage.removeItem(INTERNAL_TRAFFIC_KEY);
      writeInternalTrafficCookie(0);
    } else if (window.localStorage.getItem(INTERNAL_TRAFFIC_KEY) === '1') {
      writeInternalTrafficCookie(COOKIE_MAX_AGE_SECONDS);
    }
  } catch {
    // A full or blocked localStorage must never break a navigation.
  }
};

export const isInternalTraffic = (): boolean => {
  if (typeof window === 'undefined') return false;

  try {
    return window.localStorage.getItem(INTERNAL_TRAFFIC_KEY) === '1';
  } catch {
    return false;
  }
};
