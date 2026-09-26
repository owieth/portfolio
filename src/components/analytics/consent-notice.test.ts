import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  consentNotice,
  openConsentNotice,
} from '@/components/analytics/consent-notice';
import { GRANTED_DEFAULT } from '@/lib/analytics/consent';

/**
 * The privacy signal is read from `navigator` at call time, and Node 21+ ships a
 * real one, so each test stubs the globals it needs.
 */
const stubNavigator = (
  props: { globalPrivacyControl?: boolean; doNotTrack?: string } = {},
) => vi.stubGlobal('navigator', props);

const stubDocument = (cookie = '') => vi.stubGlobal('document', { cookie });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('openConsentNotice', () => {
  it('opens the notice under its fixed id', () => {
    stubNavigator();
    stubDocument('');
    const add = vi.spyOn(consentNotice, 'add');

    openConsentNotice();

    expect(add).toHaveBeenCalledOnce();
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'ow-consent-notice',
        timeout: 0,
        priority: 'low',
      }),
    );
  });

  it('reopens even when a choice is stored', () => {
    stubNavigator();
    stubDocument(
      `ow_consent=${encodeURIComponent(JSON.stringify(GRANTED_DEFAULT))}`,
    );
    const add = vi.spyOn(consentNotice, 'add');

    openConsentNotice();

    expect(add).toHaveBeenCalledOnce();
  });

  it('stays closed under Global Privacy Control', () => {
    stubNavigator({ globalPrivacyControl: true });
    stubDocument('');
    const add = vi.spyOn(consentNotice, 'add');

    openConsentNotice();

    expect(add).not.toHaveBeenCalled();
  });

  it('stays closed under Do Not Track', () => {
    stubNavigator({ doNotTrack: '1' });
    stubDocument('');
    const add = vi.spyOn(consentNotice, 'add');

    openConsentNotice();

    expect(add).not.toHaveBeenCalled();
  });
});
