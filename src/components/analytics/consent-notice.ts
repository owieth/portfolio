import { isPrivacySignalOn } from '@/lib/analytics/consent';
import { Toast } from '@base-ui/react/toast';

/**
 * Global manager shared by the `CookieNotice` provider, so the notice can be
 * reopened from outside the provider tree — e.g. the `/privacy` page.
 */
export const consentNotice = Toast.createToastManager();

/**
 * A fixed id makes a repeated `add` update the open notice rather than stack a
 * second one. `timeout: 0` keeps it up until the visitor acts; `priority: 'low'`
 * lets Base UI announce it politely (equivalent to `aria-live="polite"`), so no
 * second live region is added.
 */
export const CONSENT_NOTICE = {
  id: 'ow-consent-notice',
  title: 'Cookies & analytics',
  description:
    'This site uses Google Analytics to see how it is used, and Vercel Analytics for aggregate traffic. You can opt out at any time.',
  timeout: 0,
  priority: 'low',
} as const;

/**
 * Brings the notice back regardless of a stored choice. Skipped under a browser
 * privacy signal (GPC/DNT): "Got it" would otherwise push a granting consent
 * update over a binding opt-out for the rest of the page view.
 */
export const openConsentNotice = (): void => {
  if (isPrivacySignalOn()) return;

  consentNotice.add(CONSENT_NOTICE);
};
