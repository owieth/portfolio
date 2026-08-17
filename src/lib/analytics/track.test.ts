import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AnalyticsEvent } from '@/lib/analytics/events';

/**
 * `config` reads the env at module load, so toggling analytics on/off means
 * re-importing `track` after stubbing the env. `resolveConsent` reads the
 * globals at call time, so consent and the window `dataLayer` are stubbed
 * directly.
 */
const importTrack = async () => {
  vi.resetModules();
  return (await import('@/lib/analytics/track')).track;
};

const enableAnalytics = () => {
  vi.stubEnv('NEXT_PUBLIC_GTM_ID', 'GTM-TEST');
  vi.stubEnv('NEXT_PUBLIC_GA_ID', 'G-TEST');
};

const grantConsent = () => vi.stubGlobal('navigator', {});

const pageView: AnalyticsEvent = { name: 'page_view', page_path: '/' };

beforeEach(() => {
  vi.stubGlobal('window', {});
  vi.stubGlobal('document', { cookie: '' });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('track', () => {
  it('no-ops and logs to the console when analytics is disabled', async () => {
    vi.stubEnv('NEXT_PUBLIC_GTM_ID', '');
    vi.stubEnv('NEXT_PUBLIC_GA_ID', '');
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const track = await importTrack();

    track(pageView);

    expect(debug).toHaveBeenCalledWith('[analytics]', pageView);
    expect(window.dataLayer).toBeUndefined();
  });

  it('no-ops when analytics consent is denied', async () => {
    enableAnalytics();
    vi.stubGlobal('navigator', { globalPrivacyControl: true });
    const track = await importTrack();

    track(pageView);

    expect(window.dataLayer).toBeUndefined();
  });

  it('pushes exactly once to the dataLayer when enabled and granted', async () => {
    enableAnalytics();
    grantConsent();
    const track = await importTrack();

    track(pageView);

    expect(window.dataLayer).toEqual([{ event: 'page_view', page_path: '/' }]);
  });

  it('does not double-push on repeated calls', async () => {
    enableAnalytics();
    grantConsent();
    const track = await importTrack();

    track(pageView);
    track({ name: 'page_view', page_path: '/about' });

    expect(window.dataLayer).toHaveLength(2);
  });
});
