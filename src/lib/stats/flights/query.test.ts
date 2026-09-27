import { PHASE_PRODUCTION_BUILD } from 'next/constants';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Tables } from '@/lib/supabase/database.types';
import { getSupabaseClient } from '@/lib/supabase/server';

import { loadFlights } from './query';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ getSupabaseClient: vi.fn() }));

type Response = { data: unknown[] | null; error: { message: string } | null };

/**
 * A stand-in for the `supabase-js` builder, as far as `loadFlights` walks it:
 * `from → select → order → order`, then awaited. The real builder only sends
 * the request from its `then`, so this one answers from there too, and a
 * thrown request rejects the `await` rather than any call in the chain.
 */
function fakeClient(rows: unknown[] | Error | { message: string }) {
  const respond = async (): Promise<Response> => {
    if (rows instanceof Error) throw rows;
    if (!Array.isArray(rows)) return { data: null, error: rows };

    return { data: rows, error: null };
  };

  const builder = {
    select: () => builder,
    order: () => builder,
    then: (
      resolve: (response: Response) => void,
      reject: (reason: unknown) => void,
    ) => respond().then(resolve, reject),
  };

  vi.mocked(getSupabaseClient).mockReturnValue({
    from: () => builder,
  } as never);
}

const flight: Tables<'flights'> = {
  id: '3b0c6f2a-0000-4000-8000-000000000001',
  flown_on: '2017-07-14',
  origin: 'ZRH',
  destination: 'BCN',
  airline: 'LX',
  flight_number: '1954',
  aircraft: 'A320',
  duration_minutes: 110,
  created_at: '2026-09-21T06:16:23Z',
};

describe('loadFlights', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.mocked(getSupabaseClient).mockReset();
    vi.stubEnv('NEXT_PHASE', undefined);
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
    vi.unstubAllEnvs();
  });

  it('reports an unset env as unconfigured', async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(null);

    expect(await loadFlights()).toEqual({ configured: false, flights: [] });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('renames rows onto Flight', async () => {
    fakeClient([flight]);

    expect(await loadFlights()).toEqual({
      configured: true,
      flights: [
        {
          id: '3b0c6f2a-0000-4000-8000-000000000001',
          flownOn: '2017-07-14',
          origin: 'ZRH',
          destination: 'BCN',
          airline: 'LX',
          flightNumber: '1954',
          aircraft: 'A320',
          durationMinutes: 110,
        },
      ],
    });
  });

  it('throws on a failed read outside the build', async () => {
    fakeClient({ message: 'Invalid API key' });

    await expect(loadFlights()).rejects.toThrow(
      'stats/flights read failed: Invalid API key',
    );
    expect(consoleError.mock.calls).toEqual([
      ['[stats/flights] read failed: Invalid API key'],
    ]);
  });

  it('returns a failed read as a result during next build', async () => {
    vi.stubEnv('NEXT_PHASE', PHASE_PRODUCTION_BUILD);
    fakeClient({ message: 'Invalid API key' });

    expect(await loadFlights()).toEqual({
      configured: true,
      error: 'Invalid API key',
      flights: [],
    });
    expect(consoleError).toHaveBeenCalledWith(
      '[stats/flights] read failed: Invalid API key',
    );
  });

  it('throws on a thrown request outside the build', async () => {
    fakeClient(new TypeError('fetch failed'));

    await expect(loadFlights()).rejects.toThrow(
      'stats/flights read failed: TypeError: fetch failed',
    );
    expect(consoleError.mock.calls).toEqual([
      ['[stats/flights] read failed: TypeError: fetch failed'],
    ]);
  });
});
