import vm from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ALL_DENIED,
  GRANTED_DEFAULT,
  resolveConsent,
} from '@/lib/analytics/consent';
import { consentBootstrapScript } from '@/lib/analytics/consent-bootstrap';

/**
 * The inline script is a hand-written copy of `resolveConsent()`, so each case
 * runs it in a fresh VM context and compares its `gtag('consent', 'default', …)`
 * call with what the TypeScript version returns under the same globals.
 */
const stubNavigator = (
  props: { globalPrivacyControl?: boolean; doNotTrack?: string } = {},
) => vi.stubGlobal('navigator', props);

const stubDocument = (cookie = '') => vi.stubGlobal('document', { cookie });

afterEach(() => {
  vi.unstubAllGlobals();
});

const runBootstrap = (cookie: string): unknown[] => {
  const window: { dataLayer?: ArrayLike<unknown>[] } = {};
  vm.runInNewContext(consentBootstrapScript, {
    window,
    navigator,
    document: { cookie },
  });

  expect(window.dataLayer).toHaveLength(1);
  return Array.from(window.dataLayer![0]);
};

const expectParity = (cookie: string) => {
  stubDocument(cookie);

  expect(runBootstrap(cookie)).toEqual([
    'consent',
    'default',
    resolveConsent(),
  ]);
};

const cookieFor = (state: object) =>
  `ow_consent=${encodeURIComponent(JSON.stringify(state))}`;

describe('consentBootstrapScript', () => {
  it('matches resolveConsent with no cookie', () => {
    stubNavigator();
    expectParity('');
  });

  it('matches resolveConsent for an opted-out cookie', () => {
    stubNavigator();
    expectParity(cookieFor(ALL_DENIED));
  });

  it('matches resolveConsent for a granting cookie', () => {
    stubNavigator();
    expectParity(cookieFor(GRANTED_DEFAULT));
  });

  it('lets Global Privacy Control beat a granting cookie', () => {
    stubNavigator({ globalPrivacyControl: true });
    expectParity(cookieFor(GRANTED_DEFAULT));
  });

  it('honours Do Not Track', () => {
    stubNavigator({ doNotTrack: '1' });
    expectParity('');
  });

  it('treats a corrupt cookie as absent', () => {
    stubNavigator();
    expectParity('ow_consent=%7Bnope');
  });

  it('finds ow_consent after other cookies', () => {
    stubNavigator();
    expectParity(`_ga=GA1.1.1.2; ${cookieFor(ALL_DENIED)}`);
  });
});
