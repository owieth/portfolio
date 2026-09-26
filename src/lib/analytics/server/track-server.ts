import { after } from 'next/server';

import { isServerAnalyticsEnabled } from '@/lib/analytics/config';
import {
  isServerConsentGranted,
  sendMeasurementProtocolEvent,
  type ServerAnalyticsEvent,
} from '@/lib/analytics/server/measurement-protocol';

/**
 * The single entry point routes and Server Components use to emit a server
 * event. `after()` runs the Measurement Protocol POST once the response has
 * flushed, so it never blocks the handler and the function stays alive long
 * enough to send it on Vercel Fluid Compute.
 *
 * Mirrors client `track()`: when the server layer is unconfigured (env unset)
 * it logs to the console instead of firing, keeping dev and CI silent, and it
 * sends nothing for a visitor who opted out or whose browser sends GPC or DNT.
 * The `after` import is isolated here so `measurement-protocol.ts` stays
 * importable in the node test environment without a request context.
 */
export const trackServer = (
  event: ServerAnalyticsEvent,
  headers: Headers,
): void => {
  if (!isServerAnalyticsEnabled) {
    console.debug('[analytics]', event);
    return;
  }

  if (!isServerConsentGranted(headers)) return;

  const cookieHeader = headers.get('cookie');
  after(() => sendMeasurementProtocolEvent(event, cookieHeader));
};
