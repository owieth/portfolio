import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  isInternalTraffic,
  syncInternalTrafficFlag,
} from '@/lib/analytics/internal-traffic';

const makeStorage = (initial: Record<string, string> = {}) => {
  const store: Record<string, string> = { ...initial };
  return {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
  };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('internal-traffic', () => {
  it('sets the flag on ?ow_internal=1', () => {
    const localStorage = makeStorage();
    vi.stubGlobal('window', { localStorage });

    syncInternalTrafficFlag('ow_internal=1');

    expect(localStorage.getItem('ow_internal')).toBe('1');
    expect(isInternalTraffic()).toBe(true);
  });

  it('clears the flag on ?ow_internal=0', () => {
    const localStorage = makeStorage({ ow_internal: '1' });
    vi.stubGlobal('window', { localStorage });

    syncInternalTrafficFlag('ow_internal=0');

    expect(localStorage.getItem('ow_internal')).toBeNull();
    expect(isInternalTraffic()).toBe(false);
  });

  it('leaves an existing flag untouched when the param is absent', () => {
    const localStorage = makeStorage({ ow_internal: '1' });
    vi.stubGlobal('window', { localStorage });

    syncInternalTrafficFlag('foo=bar');

    expect(isInternalTraffic()).toBe(true);
  });

  it('is false on the server, where there is no window', () => {
    expect(isInternalTraffic()).toBe(false);
  });
});
