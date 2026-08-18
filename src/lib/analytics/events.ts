/**
 * The event contract. Every later analytics layer adds a member to this
 * discriminated union rather than inventing its own push shape, so the whole
 * app speaks one vocabulary and `track()` stays the single entry point.
 *
 * `name` is the discriminant and becomes the GA4 event name. The rest of an
 * event's own keys become GA4 event parameters.
 */
export type PageViewEvent = {
  name: 'page_view';
  page_path: string;
  page_title?: string;
};

export type WebVitalsEvent = {
  name: 'web_vitals';
  metric_name: string;
  metric_value: number;
  metric_rating: 'good' | 'needs-improvement' | 'poor';
  metric_id: string;
  page_path: string;
};

export type AnalyticsEvent = PageViewEvent | WebVitalsEvent;

/**
 * GA4 silently drops an event whose name exceeds 40 characters or that carries
 * more than 25 parameters — no error, no console warning, the hit just never
 * lands. `isValidEvent` is the runtime guard the tests pin against, because the
 * union above vanishes at compile time and cannot check a value at runtime.
 */
export const MAX_EVENT_NAME_LENGTH = 40;
export const MAX_EVENT_PARAMS = 25;

export const isValidEvent = (event: AnalyticsEvent): boolean => {
  const paramCount = Object.keys(event).filter(key => key !== 'name').length;

  return (
    event.name.length <= MAX_EVENT_NAME_LENGTH && paramCount <= MAX_EVENT_PARAMS
  );
};
