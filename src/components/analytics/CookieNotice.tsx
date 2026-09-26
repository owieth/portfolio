'use client';

import {
  CONSENT_NOTICE,
  consentNotice,
} from '@/components/analytics/consent-notice';
import {
  ALL_DENIED,
  GRANTED_DEFAULT,
  isPrivacySignalOn,
  readConsentCookie,
  writeConsentCookie,
  type ConsentState,
} from '@/lib/analytics/consent';
import { cn } from '@/lib/wo-haere/cn';
import { Toast } from '@base-ui/react/toast';
import Link from 'next/link';
import { useEffect, useRef } from 'react';

/**
 * Persists the visitor's choice and pushes a Consent Mode update so GA4 reacts
 * within the same page view — the `beforeInteractive` bootstrap only sets the
 * initial default.
 */
const applyConsent = (state: ConsentState): void => {
  writeConsentCookie(state);
  window.gtag?.('consent', 'update', state);
};

/**
 * Shows the notice by itself once — skipped when a prior choice is stored in
 * `ow_consent` or a browser privacy signal (GPC/DNT) already forces an opt-out.
 * `/privacy` can bring it back later through `openConsentNotice`.
 *
 * This goes through the provider's own manager, not `consentNotice`: the
 * provider subscribes to the global manager in an effect that runs after this
 * child's, so a mount-time `consentNotice.add` would be lost.
 */
function ConsentTrigger() {
  const manager = Toast.useToastManager();
  const shown = useRef(false);

  useEffect(() => {
    if (shown.current || isPrivacySignalOn() || readConsentCookie() !== null) {
      return;
    }
    shown.current = true;
    manager.add(CONSENT_NOTICE);
  }, [manager]);

  return null;
}

function ConsentToasts() {
  const { toasts, close } = Toast.useToastManager();

  return toasts.map(toast => (
    <Toast.Root
      key={toast.id}
      toast={toast}
      className={cn(
        'border-line bg-background text-foreground',
        'w-[min(28rem,calc(100vw-2rem))] rounded-2xl border p-4 shadow-lg',
      )}
    >
      <Toast.Title className="text-sm font-medium" />
      <Toast.Description className="text-muted mt-1 text-sm text-pretty" />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            applyConsent(GRANTED_DEFAULT);
            close(toast.id);
          }}
          className="bg-foreground text-background rounded-full px-4 py-1.5 text-sm font-medium hover:opacity-90"
        >
          Got it
        </button>
        <button
          type="button"
          onClick={() => {
            applyConsent(ALL_DENIED);
            close(toast.id);
          }}
          className="border-line hover:border-foreground rounded-full border px-4 py-1.5 text-sm font-medium"
        >
          Opt out
        </button>
        <Link
          href="/privacy"
          className="text-muted hover:text-foreground ml-auto text-sm underline underline-offset-2"
        >
          Privacy
        </Link>
      </div>
    </Toast.Root>
  ));
}

export default function CookieNotice() {
  return (
    <Toast.Provider toastManager={consentNotice}>
      <ConsentTrigger />
      <Toast.Portal>
        <Toast.Viewport
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 flex justify-center',
            'px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]',
          )}
        >
          <ConsentToasts />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}
