import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ALL_DENIED } from '@/lib/analytics/consent';

/**
 * `after` needs a request context the node test environment lacks, so it is a
 * hoisted mock that survives `vi.resetModules()`. `config` reads the env at
 * module load, so each case re-imports after stubbing it.
 */
const after = vi.hoisted(() => vi.fn());
vi.mock('next/server', () => ({ after }));

const EVENT = { name: 'swisstopo_error_server', upstream_ms: 5 } as const;

const importModule = async () => {
  vi.resetModules();
  return import('@/lib/analytics/server/track-server');
};

const enableServer = () => {
  vi.stubEnv('NEXT_PUBLIC_GA_ID', 'G-TESTSTREAM');
  vi.stubEnv('GA4_API_SECRET', 'secret-123');
};

beforeEach(() => {
  enableServer();
});

afterEach(() => {
  after.mockReset();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('trackServer', () => {
  it('schedules no send for an opted-out visitor', async () => {
    const { trackServer } = await importModule();

    trackServer(
      EVENT,
      new Headers({
        cookie: `_ga=GA1.1.111.222; ow_consent=${encodeURIComponent(
          JSON.stringify(ALL_DENIED),
        )}`,
      }),
    );

    expect(after).not.toHaveBeenCalled();
  });

  it('schedules no send under Global Privacy Control', async () => {
    const { trackServer } = await importModule();

    trackServer(
      EVENT,
      new Headers({ cookie: '_ga=GA1.1.111.222', 'sec-gpc': '1' }),
    );

    expect(after).not.toHaveBeenCalled();
  });

  it('schedules one send when no choice is stored', async () => {
    const { trackServer } = await importModule();

    trackServer(EVENT, new Headers({ cookie: '_ga=GA1.1.111.222' }));

    expect(after).toHaveBeenCalledTimes(1);
  });

  it('logs instead of scheduling when the server layer is off', async () => {
    vi.stubEnv('GA4_API_SECRET', '');
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const { trackServer } = await importModule();

    trackServer(EVENT, new Headers());

    expect(debug).toHaveBeenCalledWith('[analytics]', EVENT);
    expect(after).not.toHaveBeenCalled();
  });
});
