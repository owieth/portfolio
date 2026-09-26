import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { WebVitalsMetric } from '@/lib/analytics/web-vitals';

/**
 * `landingPath` is module state, so each test re-imports the reporter after
 * `vi.resetModules()` to start with no landing path recorded.
 */
const importReporter = async () => {
  vi.resetModules();
  return (await import('@/lib/analytics/web-vitals')).reportWebVital;
};

const metric = (overrides: Partial<WebVitalsMetric>): WebVitalsMetric => ({
  name: 'LCP',
  value: 0,
  rating: 'good',
  id: 'v1-test',
  delta: 0,
  entries: [],
  navigationType: 'navigate',
  ...overrides,
});

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_GTM_ID', 'GTM-TEST');
  vi.stubEnv('NEXT_PUBLIC_GA_ID', 'G-TEST');
  vi.stubGlobal('navigator', {});
  vi.stubGlobal('document', { cookie: '' });
  vi.stubGlobal('window', { location: { pathname: '/' } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('reportWebVital', () => {
  it('scales CLS by 1000', async () => {
    const reportWebVital = await importReporter();

    reportWebVital(metric({ name: 'CLS', value: 0.0712 }));

    expect(window.dataLayer).toMatchObject([{ metric_value: 71 }]);
  });

  it('rounds other metrics to integers', async () => {
    const reportWebVital = await importReporter();

    reportWebVital(metric({ name: 'LCP', value: 1234.6 }));

    expect(window.dataLayer).toMatchObject([{ metric_value: 1235 }]);
  });

  it('passes name, rating and id through', async () => {
    const reportWebVital = await importReporter();

    reportWebVital(
      metric({ name: 'INP', rating: 'needs-improvement', id: 'v1-inp' }),
    );

    expect(window.dataLayer).toMatchObject([
      {
        event: 'web_vitals',
        metric_name: 'INP',
        metric_rating: 'needs-improvement',
        metric_id: 'v1-inp',
      },
    ]);
  });

  it('labels every metric with the landing path', async () => {
    const reportWebVital = await importReporter();

    reportWebVital(metric({ name: 'FCP' }));
    window.location.pathname = '/projects';
    reportWebVital(metric({ name: 'LCP' }));

    expect(window.dataLayer).toMatchObject([
      { metric_name: 'FCP', page_path: '/' },
      { metric_name: 'LCP', page_path: '/' },
    ]);
  });
});
