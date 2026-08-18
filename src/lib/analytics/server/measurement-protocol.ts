import {
  GA4_API_SECRET,
  GA_ID,
  isServerAnalyticsEnabled,
} from '@/lib/analytics/config';
import { MAX_EVENT_NAME_LENGTH, MAX_EVENT_PARAMS } from '@/lib/analytics/events';

/**
 * The server-side event contract, delivered to GA4 through the Measurement
 * Protocol rather than the browser `dataLayer`. It is a union of its own — a
 * server event can never travel through client `track()` (no `window`), so the
 * two layers keep separate vocabularies while sharing the GA4 limit constants.
 *
 * Every name carries the `_server` suffix so these can never double-count the
 * client events. `name` becomes the GA4 event name; the remaining keys become
 * GA4 event parameters (joined with the MP-required params in `buildPayload`).
 */
export type ThrowResolvedServerEvent = {
  name: 'throw_resolved_server';
  art: string;
  upstream_ms: number;
  kanton?: string;
  wasser?: boolean;
  hoechi?: number;
  distanz_km?: number;
  richtig?: string;
  grund?: string;
};

export type SwisstopoErrorServerEvent = {
  name: 'swisstopo_error_server';
  upstream_ms: number;
};

export type OgUnfurlServerEvent = {
  name: 'og_unfurl_server';
  has_wurf: boolean;
  resolved: boolean;
};

export type DesignFetchFailedServerEvent = {
  name: 'design_fetch_failed_server';
  status: number;
};

export type ServerAnalyticsEvent =
  | ThrowResolvedServerEvent
  | SwisstopoErrorServerEvent
  | OgUnfurlServerEvent
  | DesignFetchFailedServerEvent;

const MP_ENDPOINT = 'https://www.google-analytics.com/mp/collect';

/**
 * GA4 accepts an MP hit without `session_id`/`engagement_time_msec` (a 204) and
 * then drops it from most reports — the quietest possible failure. A small
 * positive value keeps the hit reportable without inventing engagement.
 */
const ENGAGEMENT_TIME_MSEC = 1;

export type ClientSource = 'cookie' | 'synthetic';

const parseCookieHeader = (
  cookieHeader: string | null | undefined,
): Record<string, string> => {
  if (!cookieHeader) return {};

  const map: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    if (key) map[key] = part.slice(index + 1).trim();
  }
  return map;
};

/**
 * The GA `_ga` cookie is `GA1.1.<a>.<b>`; GA4's client_id is the trailing
 * `<a>.<b>`. A missing or truncated value yields null so the caller falls back
 * to a synthetic id — the difference is what `client_source` records.
 */
export const parseClientId = (
  cookieHeader: string | null | undefined,
): string | null => {
  const value = parseCookieHeader(cookieHeader)._ga;
  const match = value?.match(/^GA\d+\.\d+\.(\d+\.\d+)$/);
  return match ? match[1] : null;
};

/** The stream cookie is named after the measurement id minus its `G-` prefix. */
const streamCookieName = (): string => `_ga_${GA_ID.replace(/^G-/, '')}`;

/**
 * The `_ga_<STREAM>` cookie is `GS2.1.s<session_id>$…`; older browsers write
 * `GS1.1.<session_id>.…`. Both put the session id first, so one pattern reads
 * either. Missing ⇒ null, and the event ships without the param.
 */
export const parseSessionId = (
  cookieHeader: string | null | undefined,
): string | null => {
  const value = parseCookieHeader(cookieHeader)[streamCookieName()];
  const match = value?.match(/^GS\d+\.\d+\.s?(\d+)/);
  return match ? match[1] : null;
};

/**
 * A cookie-derived id attaches the event to the session that caused it; the
 * synthetic fallback covers crawlers and unfurl bots with no `_ga` cookie, and
 * `client_source` keeps the two apart in reporting.
 */
export const deriveClientId = (
  cookieHeader: string | null | undefined,
): { clientId: string; clientSource: ClientSource } => {
  const fromCookie = parseClientId(cookieHeader);
  return fromCookie
    ? { clientId: fromCookie, clientSource: 'cookie' }
    : { clientId: crypto.randomUUID(), clientSource: 'synthetic' };
};

/**
 * GA4 silently drops an event whose name exceeds 40 characters or that carries
 * more than 25 parameters. Mirrors client `isValidEvent`, reusing the same
 * pinned limits.
 */
export const isValidServerEvent = (event: ServerAnalyticsEvent): boolean => {
  const paramCount = Object.keys(event).filter(key => key !== 'name').length;

  return (
    event.name.length <= MAX_EVENT_NAME_LENGTH && paramCount <= MAX_EVENT_PARAMS
  );
};

export type MeasurementProtocolPayload = {
  client_id: string;
  events: { name: string; params: Record<string, unknown> }[];
};

export const buildPayload = (
  event: ServerAnalyticsEvent,
  cookieHeader: string | null | undefined,
): MeasurementProtocolPayload => {
  const { name, ...eventParams } = event;
  const { clientId, clientSource } = deriveClientId(cookieHeader);
  const sessionId = parseSessionId(cookieHeader);

  const params: Record<string, unknown> = {
    ...eventParams,
    engagement_time_msec: ENGAGEMENT_TIME_MSEC,
    client_source: clientSource,
  };
  if (sessionId) params.session_id = sessionId;

  return { client_id: clientId, events: [{ name, params }] };
};

/**
 * The MP POST itself. Pure and awaitable (so it can be unit-tested without a
 * request context); the `after()` scheduling that keeps it off the response
 * path lives in `track-server.ts`. No-ops when the server layer is unconfigured
 * and swallows every network error — telemetry must never surface in a route.
 */
export const sendMeasurementProtocolEvent = async (
  event: ServerAnalyticsEvent,
  cookieHeader: string | null | undefined,
): Promise<void> => {
  if (!isServerAnalyticsEnabled) return;

  if (process.env.NODE_ENV !== 'production' && !isValidServerEvent(event)) {
    console.warn(
      '[analytics] server event exceeds GA4 limits, will be dropped',
      event,
    );
  }

  const url = `${MP_ENDPOINT}?measurement_id=${encodeURIComponent(
    GA_ID,
  )}&api_secret=${encodeURIComponent(GA4_API_SECRET)}`;

  try {
    await fetch(url, {
      method: 'POST',
      body: JSON.stringify(buildPayload(event, cookieHeader)),
    });
  } catch {
    // Fire-and-forget: a failed telemetry POST must never reach the route.
  }
};
