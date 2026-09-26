'use client';

import { openConsentNotice } from '@/components/analytics/consent-notice';
import { P } from '@/components/projects/Prose';
import { isPrivacySignalOn } from '@/lib/analytics/consent';
import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/**
 * Reopens the cookie notice so a stored choice can be changed. The server
 * snapshot assumes no privacy signal, which keeps `/privacy` static.
 */
export default function ConsentChoiceButton() {
  const privacySignalOn = useSyncExternalStore(
    subscribe,
    isPrivacySignalOn,
    () => false,
  );

  if (privacySignalOn) {
    return (
      <P>
        Your browser sends a Global Privacy Control or Do Not Track signal, so
        Google Analytics stays off here and there is nothing to change.
      </P>
    );
  }

  return (
    <button
      type="button"
      onClick={openConsentNotice}
      className="border-line hover:border-foreground self-start rounded-full border px-4 py-1.5 text-sm font-medium"
    >
      Show the notice again
    </button>
  );
}
