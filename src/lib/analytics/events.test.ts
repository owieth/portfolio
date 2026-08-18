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

  it('accepts the link, nav and 404 events', () => {
    const events: AnalyticsEvent[] = [
      {
        name: 'outbound_click',
        link_url: 'https://github.com/owieth',
        link_text: 'GitHub',
        link_domain: 'github.com',
      },
      {
        name: 'internal_link_click',
        link_url: 'https://olivierwinkler.com/projects',
        link_text: 'Projects',
        link_domain: 'olivierwinkler.com',
      },
      {
        name: 'nav_click',
        link_url: 'https://olivierwinkler.com/',
        link_text: 'Home',
        nav_location: 'header',
      },
      {
        name: 'project_cta_click',
        project_slug: 'macvitals',
        cta_label: 'Source',
      },
      {
        name: 'download_click',
        project_slug: 'macvitals',
        link_url: 'https://github.com/owieth/MacVitals/releases/latest',
      },
      {
        name: 'citation_click',
        link_url: 'https://example.com/paper',
        link_text: 'the paper',
        link_domain: 'example.com',
      },
      { name: 'page_not_found', page_path: '/nope', referrer: '' },
    ];

    for (const event of events) expect(isValidEvent(event)).toBe(true);
  });

  it('accepts the wo-haere throw funnel events', () => {
    const events: AnalyticsEvent[] = [
      { name: 'throw_started', input_method: 'drag' },
      { name: 'throw_input_method', input_method: 'fling' },
      { name: 'throw_input_method', input_method: 'tap' },
      { name: 'throw_input_method', input_method: 'keyboard' },
      { name: 'throw_abandoned', input_method: 'drag' },
      {
        name: 'throw_completed',
        outcome: 'preich',
        throw_quality: 'sufer',
        canton: 'BE',
        municipality: 'Bern',
        elevation: 542,
        distance_km: 0,
        bearing: 'N',
        water: false,
      },
      {
        name: 'throw_completed',
        outcome: 'dernaebe',
        throw_quality: 'chnorz',
        miss_reason: 'usland',
      },
      { name: 'throw_off_map' },
      { name: 'throw_api_error', status: 500 },
      { name: 'shared_throw_opened' },
      { name: 'panel_toggle', open: true },
      { name: 'map_engaged' },
    ];

    for (const event of events) expect(isValidEvent(event)).toBe(true);
  });

  it('accepts the seeded web_vitals event', () => {
    expect(
      isValidEvent({
        name: 'web_vitals',
        metric_name: 'CLS',
        metric_value: 70,
        metric_rating: 'good',
        metric_id: 'v5-1700000000000-1234567890123',
        page_path: '/',
      }),
    ).toBe(true);
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
