'use client';

import { denyAll, grantAll, readConsent } from '@/lib/analytics/consent';
import { cn } from '@/lib/wo-haere/cn';
import { Toast } from '@base-ui/react/toast';
import Link from 'next/link';
import { useEffect, useRef } from 'react';

const NOTICE_ID = 'ow-consent-notice';

/**
 * Shows the notice once, only when no choice is stored in the `ow_consent`
 * cookie. `timeout: 0` keeps it up until the visitor acts; `priority: 'low'`
 * lets Base UI announce it politely (equivalent to `aria-live="polite"`), so no
 * second live region is added.
 */
function ConsentTrigger() {
  const manager = Toast.useToastManager();
  const shown = useRef(false);

  useEffect(() => {
    if (shown.current || readConsent() !== null) return;
    shown.current = true;
    manager.add({
      id: NOTICE_ID,
      title: 'Cookies & analytics',
      description:
        'This site uses Google Analytics to see how it is used, and Vercel Analytics for aggregate traffic. You can opt out at any time.',
      timeout: 0,
      priority: 'low',
    });
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
            grantAll();
            close(toast.id);
          }}
          className="bg-foreground text-background rounded-full px-4 py-1.5 text-sm font-medium hover:opacity-90"
        >
          Got it
        </button>
        <button
          type="button"
          onClick={() => {
            denyAll();
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
    <Toast.Provider>
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
