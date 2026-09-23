/**
 * Backoff for the Overpass API, which says "not now" more often than it says
 * "no".
 *
 * The public instance rations slots per client and answers 429 when they are
 * taken, and 504 when it is too busy to start the query at all. Both clear by
 * themselves, so they are retried with an exponential wait. A query it could not
 * parse (400) never improves by being sent again and fails at once.
 *
 * The wait is the larger of the backoff and the server's own `Retry-After`,
 * capped, so a misbehaving header cannot park the build for an hour.
 */

/**
 * Almost eight minutes of waiting in all. The first live run took four 504s
 * in a row before the train query found a slot, so four steps is not enough.
 */
export const BACKOFF_MS = [15_000, 30_000, 60_000, 120_000, 240_000] as const;

const MAX_RETRY_AFTER_MS = 300_000;

/** The statuses that mean "try again later", as opposed to "this will never work". */
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

/** A failure worth another attempt, with the server's own wait where it gave one. */
export class RetryableError extends Error {
  readonly retryAfterMs: number | null;

  constructor(message: string, retryAfterMs: number | null = null, cause?: unknown) {
    super(message, { cause });
    this.name = 'RetryableError';
    this.retryAfterMs = retryAfterMs;
  }
}

export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUSES.has(status);
}

/** `Retry-After` as either delay-seconds or an HTTP date, per RFC 9110. */
export function parseRetryAfter(value: string | null, now: Date): number | null {
  if (value === null || value.trim() === '') {
    return null;
  }

  const ms = /^\d+$/.test(value.trim())
    ? Number(value.trim()) * 1000
    : new Date(value).getTime() - now.getTime();

  if (Number.isNaN(ms)) {
    return null;
  }

  return Math.min(Math.max(ms, 0), MAX_RETRY_AFTER_MS);
}

export type Sleep = (ms: number) => Promise<void>;

export const sleep: Sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

interface RetryOptions {
  label: string;
  log: (message: string) => void;
  sleep: Sleep;
  delays?: readonly number[];
}

/**
 * Runs `attempt` until it succeeds, throws something that is not a
 * `RetryableError`, or runs out of delays — one more attempt than there are.
 */
export async function withRetry<T>(
  attempt: () => Promise<T>,
  { label, log, sleep, delays = BACKOFF_MS }: RetryOptions,
): Promise<T> {
  for (let tries = 0; ; tries++) {
    try {
      // Sequential by definition: the next attempt only exists if this one failed.
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      return await attempt();
    } catch (error) {
      if (!(error instanceof RetryableError) || tries >= delays.length) {
        throw error;
      }

      const wait = Math.max(delays[tries], error.retryAfterMs ?? 0);
      log(
        `${label}: ${error.message}; attempt ${tries + 2} of ${delays.length + 1} in ${Math.round(wait / 1000)} s`,
      );
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      await sleep(wait);
    }
  }
}
