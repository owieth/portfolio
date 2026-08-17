import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ALL_DENIED,
  GRANTED_DEFAULT,
  readConsentCookie,
  resolveConsent,
  writeConsentCookie,
} from '@/lib/analytics/consent';

/**
 * The state machine reads `document` and `navigator` at call time, so each test
 * stubs the globals it needs. Node 21+ ships a real `navigator`, so a privacy
 * signal has to be stubbed explicitly rather than assumed absent.
 */
const stubNavigator = (
  props: { globalPrivacyControl?: boolean; doNotTrack?: string } = {},
) => vi.stubGlobal('navigator', props);

const stubDocument = (cookie = '') => vi.stubGlobal('document', { cookie });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveConsent', () => {
  it('grants the analytics category by default', () => {
    stubNavigator();
    stubDocument('');

    const state = resolveConsent();

    expect(state.analytics_storage).toBe('granted');
    expect(state).toEqual(GRANTED_DEFAULT);
  });

  it('leaves the ad categories denied by default', () => {
    // The site shows no ads, so nothing consumes ad consent — keep it denied.
    stubNavigator();
    stubDocument('');

    const state = resolveConsent();

    expect(state.ad_storage).toBe('denied');
    expect(state.ad_user_data).toBe('denied');
    expect(state.ad_personalization).toBe('denied');
  });

  it('forces every category denied when Global Privacy Control is on', () => {
    stubNavigator({ globalPrivacyControl: true });
    stubDocument('');

    expect(resolveConsent()).toEqual(ALL_DENIED);
  });

  it('forces every category denied when Do Not Track is on', () => {
    stubNavigator({ doNotTrack: '1' });
    stubDocument('');

    expect(resolveConsent()).toEqual(ALL_DENIED);
  });

  it('lets a privacy signal override a granting cookie', () => {
    // A binding opt-out must win even if an older cookie said granted.
    stubNavigator({ globalPrivacyControl: true });
    stubDocument(`ow_consent=${encodeURIComponent(JSON.stringify(GRANTED_DEFAULT))}`);

    expect(resolveConsent()).toEqual(ALL_DENIED);
  });
});

describe('the ow_consent cookie', () => {
  it('round-trips a written state back through the reader', () => {
    stubDocument('');
    const chosen = { ...GRANTED_DEFAULT, analytics_storage: 'denied' as const };

    writeConsentCookie(chosen);

    expect(readConsentCookie()).toEqual(chosen);
  });

  it('treats a corrupt cookie as absent rather than throwing', () => {
    stubDocument('ow_consent=not-json');

    expect(readConsentCookie()).toBeNull();
  });

  it('reads null when there is no cookie', () => {
    stubDocument('other=1');

    expect(readConsentCookie()).toBeNull();
  });
});
