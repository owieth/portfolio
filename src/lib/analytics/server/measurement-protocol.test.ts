import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `config` reads the env at module load, so toggling the server layer on/off
 * means re-importing after stubbing the env — the same pattern `track.test.ts`
 * uses. The Measurement Protocol module deliberately avoids `next/server`, so it
 * imports cleanly in the node test environment without a request context.
 */
const GA_ID = 'G-TESTSTREAM';
const STREAM = 'TESTSTREAM';
const API_SECRET = 'secret-123';

const importModule = async () => {
  vi.resetModules();
  return import('@/lib/analytics/server/measurement-protocol');
};

const enableServer = () => {
  vi.stubEnv('NEXT_PUBLIC_GA_ID', GA_ID);
  vi.stubEnv('GA4_API_SECRET', API_SECRET);
};

beforeEach(() => {
  enableServer();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('parseClientId', () => {
  it('extracts the trailing client id from a well-formed _ga cookie', async () => {
    const { parseClientId } = await importModule();

    expect(parseClientId('_ga=GA1.1.1234567890.1700000000')).toBe(
      '1234567890.1700000000',
    );
  });

  it('returns null for a malformed _ga cookie', async () => {
    const { parseClientId } = await importModule();

    expect(parseClientId('_ga=broken')).toBeNull();
    expect(parseClientId('_ga=GA1.1.')).toBeNull();
  });

  it('returns null when the _ga cookie is absent', async () => {
    const { parseClientId } = await importModule();

    expect(parseClientId('other=1')).toBeNull();
    expect(parseClientId(null)).toBeNull();
  });
});

describe('parseSessionId', () => {
  it('reads the session id from the GS2 stream cookie', async () => {
    const { parseSessionId } = await importModule();

    expect(parseSessionId(`_ga_${STREAM}=GS2.1.s1700000000$o5$g1`)).toBe(
      '1700000000',
    );
  });

  it('reads the older GS1 stream format', async () => {
    const { parseSessionId } = await importModule();

    expect(parseSessionId(`_ga_${STREAM}=GS1.1.1700000000.5.1`)).toBe(
      '1700000000',
    );
  });

  it('returns null when the stream cookie is absent', async () => {
    const { parseSessionId } = await importModule();

    expect(parseSessionId('_ga=GA1.1.10.20')).toBeNull();
    expect(parseSessionId(null)).toBeNull();
  });
});

describe('deriveClientId', () => {
  it('tags a cookie-derived id', async () => {
    const { deriveClientId } = await importModule();

    expect(deriveClientId('_ga=GA1.1.10.20')).toEqual({
      clientId: '10.20',
      clientSource: 'cookie',
    });
  });

  it('falls back to a synthetic id when there is no cookie', async () => {
    const { deriveClientId } = await importModule();

    const result = deriveClientId(null);

    expect(result.clientSource).toBe('synthetic');
    expect(result.clientId.length).toBeGreaterThan(0);
  });
});

describe('buildPayload', () => {
  const cookieHeader = `_ga=GA1.1.10.20; _ga_${STREAM}=GS2.1.s999$o1`;

  it('nests event params with session_id and engagement_time_msec', async () => {
    const { buildPayload } = await importModule();

    expect(
      buildPayload(
        { name: 'og_unfurl_server', has_wurf: true, resolved: false },
        cookieHeader,
      ),
    ).toEqual({
      client_id: '10.20',
      events: [
        {
          name: 'og_unfurl_server',
          params: {
            has_wurf: true,
            resolved: false,
            session_id: '999',
            engagement_time_msec: 1,
            client_source: 'cookie',
          },
        },
      ],
    });
  });

  it('omits session_id when the stream cookie is missing', async () => {
    const { buildPayload } = await importModule();

    const payload = buildPayload(
      { name: 'design_fetch_failed_server', status: 503 },
      '_ga=GA1.1.10.20',
    );

    expect(payload.events[0].params).not.toHaveProperty('session_id');
    expect(payload.events[0].params.engagement_time_msec).toBe(1);
  });

  it('keeps the _server suffix as the event name and tags synthetic clients', async () => {
    const { buildPayload } = await importModule();

    const payload = buildPayload(
      { name: 'swisstopo_error_server', upstream_ms: 12 },
      null,
    );

    expect(payload.events[0].name).toBe('swisstopo_error_server');
    expect(payload.events[0].params.client_source).toBe('synthetic');
  });
});

describe('sendMeasurementProtocolEvent', () => {
  it('POSTs to the MP endpoint with measurement_id and api_secret', async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const { sendMeasurementProtocolEvent } = await importModule();

    await sendMeasurementProtocolEvent(
      { name: 'swisstopo_error_server', upstream_ms: 5 },
      '_ga=GA1.1.10.20',
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const parsed = new URL(url);
    expect(`${parsed.origin}${parsed.pathname}`).toBe(
      'https://www.google-analytics.com/mp/collect',
    );
    expect(parsed.searchParams.get('measurement_id')).toBe(GA_ID);
    expect(parsed.searchParams.get('api_secret')).toBe(API_SECRET);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string).events[0].name).toBe(
      'swisstopo_error_server',
    );
  });

  it('never rejects when fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('network down'))),
    );
    const { sendMeasurementProtocolEvent } = await importModule();

    await expect(
      sendMeasurementProtocolEvent(
        { name: 'swisstopo_error_server', upstream_ms: 5 },
        null,
      ),
    ).resolves.toBeUndefined();
  });

  it('no-ops when the server layer is disabled', async () => {
    vi.stubEnv('GA4_API_SECRET', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { sendMeasurementProtocolEvent } = await importModule();

    await sendMeasurementProtocolEvent(
      { name: 'swisstopo_error_server', upstream_ms: 5 },
      null,
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
