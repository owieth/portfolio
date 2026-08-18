import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { UserProperties } from '@/lib/analytics/user-properties';
import type { WurfEintrag } from '@/lib/wo-haere/types';

/**
 * `config` reads the env at module load, so toggling analytics on/off means
 * re-importing the module after stubbing the env (mirrors `track.test.ts`).
 */
const importModule = async () => {
  vi.resetModules();
  return import('@/lib/analytics/user-properties');
};

const enableAnalytics = () => {
  vi.stubEnv('NEXT_PUBLIC_GTM_ID', 'GTM-TEST');
  vi.stubEnv('NEXT_PUBLIC_GA_ID', 'G-TEST');
};

const matchMedia = (matches: Record<string, boolean>) => (query: string) => ({
  matches: Boolean(matches[query]),
});

const preich = (kanton: string): WurfEintrag => ({
  id: kanton,
  zyt: 0,
  ziuName: null,
  isPreich: true,
  wurf: {
    art: 'preich',
    lat: 0,
    lon: 0,
    gmeind: '',
    kanton,
    gdeNr: null,
    hoechi: null,
    wasser: false,
    distanzKm: 0,
    richtig: '',
  },
});

const dernaebe = (): WurfEintrag => ({
  id: 'miss',
  zyt: 0,
  ziuName: null,
  isPreich: false,
  wurf: { art: 'dernaebe', grund: 'usland', lat: 0, lon: 0 },
});

const SAMPLE: UserProperties = {
  throw_count: 3,
  cantons_collected: 2,
  dart_skins_unlocked: 1,
  color_scheme: 'light',
  reduced_motion: false,
  pointer_type: 'fine',
};

beforeEach(() => {
  vi.stubGlobal('document', { cookie: '' });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('buildUserProperties', () => {
  it('derives game counts and device context from the throw log', async () => {
    vi.stubGlobal('window', {
      matchMedia: matchMedia({
        '(prefers-color-scheme: dark)': true,
        '(pointer: fine)': true,
      }),
    });
    const { buildUserProperties } = await importModule();

    const props = buildUserProperties([
      preich('BE'),
      preich('BE'),
      preich('ZH'),
      dernaebe(),
      dernaebe(),
    ]);

    expect(props).toEqual({
      throw_count: 5,
      cantons_collected: 2,
      dart_skins_unlocked: 2, // 5 throws unlocks the 0- and 5-throw skins
      color_scheme: 'dark',
      reduced_motion: false,
      pointer_type: 'fine',
    });
  });

  it('reports zeroes and safe defaults for an empty log', async () => {
    vi.stubGlobal('window', { matchMedia: matchMedia({}) });
    const { buildUserProperties } = await importModule();

    const props = buildUserProperties([]);

    expect(props).toEqual({
      throw_count: 0,
      cantons_collected: 0,
      dart_skins_unlocked: 1, // the 0-throw default skin is always unlocked
      color_scheme: 'light',
      reduced_motion: false,
      pointer_type: 'none',
    });
  });
});

describe('setUserProperties', () => {
  it('no-ops and logs to the console when analytics is disabled', async () => {
    vi.stubEnv('NEXT_PUBLIC_GTM_ID', '');
    vi.stubEnv('NEXT_PUBLIC_GA_ID', '');
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.stubGlobal('window', {});
    const { setUserProperties } = await importModule();

    setUserProperties(SAMPLE);

    expect(debug).toHaveBeenCalledWith('[analytics] user_properties', SAMPLE);
    expect(window.dataLayer).toBeUndefined();
  });

  it('no-ops when analytics consent is denied', async () => {
    enableAnalytics();
    vi.stubGlobal('navigator', { globalPrivacyControl: true });
    vi.stubGlobal('window', {});
    const { setUserProperties } = await importModule();

    setUserProperties(SAMPLE);

    expect(window.dataLayer).toBeUndefined();
  });

  it('pushes the properties to the dataLayer when enabled and granted', async () => {
    enableAnalytics();
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('window', {});
    const { setUserProperties } = await importModule();

    setUserProperties(SAMPLE);

    expect(window.dataLayer).toEqual([
      { event: 'set_user_properties', user_properties: SAMPLE },
    ]);
  });
});
