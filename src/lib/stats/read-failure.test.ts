import { PHASE_PRODUCTION_BUILD } from 'next/constants';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readFailed } from './read-failure';

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
  vi.unstubAllEnvs();
});

describe('readFailed', () => {
  it('logs and throws outside the build', () => {
    vi.stubEnv('NEXT_PHASE', undefined);

    expect(() => readFailed('stats/flights', 'Invalid API key')).toThrow(
      'stats/flights read failed: Invalid API key',
    );
    expect(consoleError).toHaveBeenCalledWith(
      '[stats/flights] read failed: Invalid API key',
    );
  });

  it('logs without throwing during next build', () => {
    vi.stubEnv('NEXT_PHASE', PHASE_PRODUCTION_BUILD);

    expect(() => readFailed('stats/flights', 'Invalid API key')).not.toThrow();
    expect(consoleError).toHaveBeenCalledWith(
      '[stats/flights] read failed: Invalid API key',
    );
  });
});
