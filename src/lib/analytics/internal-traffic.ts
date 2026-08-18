/**
 * Internal-traffic tagging. On a low-traffic personal site the owner's own
 * visits otherwise dominate every number, and there's no reliable IP filter
 * (home IP breaks on mobile data). So the owner marks their own device once:
 * visiting `?ow_internal=1` sets a localStorage flag, after which `track()`
 * attaches `traffic_type: 'internal'` to every event and GA4's built-in
 * internal-traffic data filter can exclude them. `?ow_internal=0` clears it.
 */
const INTERNAL_TRAFFIC_KEY = 'ow_internal';
const INTERNAL_TRAFFIC_PARAM = 'ow_internal';

/**
 * Reads the `ow_internal` query param and toggles the persisted flag: `1` sets,
 * `0` clears, anything else (including absence) leaves it untouched — so a plain
 * navigation never disturbs a device that was already marked.
 */
export const syncInternalTrafficFlag = (search: string): void => {
  if (typeof window === 'undefined') return;

  const value = new URLSearchParams(search).get(INTERNAL_TRAFFIC_PARAM);
  if (value !== '1' && value !== '0') return;

  try {
    if (value === '1') {
      window.localStorage.setItem(INTERNAL_TRAFFIC_KEY, '1');
    } else {
      window.localStorage.removeItem(INTERNAL_TRAFFIC_KEY);
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
