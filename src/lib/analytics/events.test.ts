import { describe, expect, it } from 'vitest';

import {
  MAX_EVENT_NAME_LENGTH,
  MAX_EVENT_PARAMS,
  isValidEvent,
  type AnalyticsEvent,
} from '@/lib/analytics/events';

/**
 * GA4 drops an over-limit event silently, so these limits guard the contract:
 * a later layer that adds a too-long name or too many params fails here rather
 * than losing hits in production with no signal.
 */
describe('GA4 event limits', () => {
  it('pins the documented GA4 limits', () => {
    expect(MAX_EVENT_NAME_LENGTH).toBe(40);
    expect(MAX_EVENT_PARAMS).toBe(25);
  });
});

describe('isValidEvent', () => {
  it('accepts the seeded page_view event', () => {
    expect(isValidEvent({ name: 'page_view', page_path: '/' })).toBe(true);
  });

  it('rejects a name longer than the limit', () => {
    const event = {
      name: 'x'.repeat(MAX_EVENT_NAME_LENGTH + 1),
      page_path: '/',
    } as unknown as AnalyticsEvent;

    expect(isValidEvent(event)).toBe(false);
  });

  it('rejects an event with more than the allowed parameters', () => {
    // `name` is the discriminant, not a parameter, so it is excluded from the
    // count — hence one more key than the param limit.
    const params = Object.fromEntries(
      Array.from({ length: MAX_EVENT_PARAMS + 1 }, (_, i) => [`p${i}`, i]),
    );
    const event = { name: 'page_view', ...params } as unknown as AnalyticsEvent;

    expect(isValidEvent(event)).toBe(false);
  });

  it('does not count the name toward the parameter budget', () => {
    const params = Object.fromEntries(
      Array.from({ length: MAX_EVENT_PARAMS }, (_, i) => [`p${i}`, i]),
    );
    const event = { name: 'page_view', ...params } as unknown as AnalyticsEvent;

    expect(isValidEvent(event)).toBe(true);
  });
});
