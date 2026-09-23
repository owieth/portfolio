import { describe, expect, it, vi } from 'vitest';

import { RetryableError, isRetryableStatus, parseRetryAfter, withRetry } from './retry.ts';

const NOW = new Date('2026-09-23T08:00:00Z');

describe('isRetryableStatus', () => {
  it.each([429, 502, 503, 504])('retries %i', status => {
    expect(isRetryableStatus(status)).toBe(true);
  });

  // A query Overpass could not parse is not going to parse on the next attempt.
  it.each([400, 403, 404, 500])('gives up on %i', status => {
    expect(isRetryableStatus(status)).toBe(false);
  });
});

describe('parseRetryAfter', () => {
  const CASES: [string, string | null, number | null][] = [
    ['no header', null, null],
    ['delay-seconds', '42', 42_000],
    ['an HTTP date', 'Wed, 23 Sep 2026 08:01:00 GMT', 60_000],
    ['a date already past', 'Wed, 23 Sep 2026 07:00:00 GMT', 0],
    // A server asking for an hour does not get to park the build for one.
    ['more than the cap', '3600', 300_000],
    ['nonsense', 'soon', null],
  ];

  it.each(CASES)('reads %s', (_label, value, expected) => {
    expect(parseRetryAfter(value, NOW)).toBe(expected);
  });
});

describe('withRetry', () => {
  const DELAYS = [10, 20, 40];

  function options() {
    return { label: 'test', log: vi.fn(), sleep: vi.fn(async () => {}), delays: DELAYS };
  }

  it('waits longer after every failure until an attempt succeeds', async () => {
    const opts = options();
    const attempt = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new RetryableError('429'))
      .mockRejectedValueOnce(new RetryableError('504'))
      .mockResolvedValue('done');

    await expect(withRetry(attempt, opts)).resolves.toBe('done');
    expect(attempt).toHaveBeenCalledTimes(3);
    expect(opts.sleep.mock.calls).toEqual([[10], [20]]);
  });

  it("waits for the server's Retry-After when it asks for longer", async () => {
    const opts = options();
    const attempt = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new RetryableError('429', 5_000))
      .mockResolvedValue('done');

    await withRetry(attempt, opts);
    expect(opts.sleep).toHaveBeenCalledWith(5_000);
  });

  it('makes one more attempt than there are delays, then throws the last error', async () => {
    const opts = options();
    const attempt = vi.fn(async () => {
      throw new RetryableError('504');
    });

    await expect(withRetry(attempt, opts)).rejects.toThrow('504');
    expect(attempt).toHaveBeenCalledTimes(DELAYS.length + 1);
  });

  it('never retries an error that is not retryable', async () => {
    const opts = options();
    const attempt = vi.fn(async () => {
      throw new Error('400 Bad Request');
    });

    await expect(withRetry(attempt, opts)).rejects.toThrow('400');
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(opts.sleep).not.toHaveBeenCalled();
  });
});
