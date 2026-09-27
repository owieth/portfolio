import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ensureMaplibreWorker } from '@/lib/maplibre/worker';

const MlMap = vi.hoisted(() => vi.fn());

vi.mock('@/lib/maplibre/subset', () => ({ Map: MlMap }));
vi.mock('@/lib/maplibre/worker', () => ({ ensureMaplibreWorker: vi.fn() }));

/**
 * The memo lives at module scope, so each case re-imports the loader after
 * `vi.resetModules()` to start with nothing loaded. Mocked modules survive
 * that reset, so every case shares one `MlMap` and one `ensureMaplibreWorker`.
 */
const importLoader = async () => {
  vi.resetModules();
  return (await import('@/lib/maplibre/load')).loadMaplibre;
};

beforeEach(() => {
  vi.mocked(ensureMaplibreWorker).mockReset();
});

describe('loadMaplibre', () => {
  it('returns one promise however often it is called', async () => {
    const loadMaplibre = await importLoader();

    const first = loadMaplibre();
    expect(loadMaplibre()).toBe(first);

    const maplibre = await first;
    expect(loadMaplibre()).toBe(first);
    expect(maplibre.Map).toBe(MlMap);
    expect(ensureMaplibreWorker).toHaveBeenCalledOnce();
  });

  it('points the worker before it resolves', async () => {
    const loadMaplibre = await importLoader();
    const order: string[] = [];
    vi.mocked(ensureMaplibreWorker).mockImplementation(() => {
      order.push('worker');
    });

    await loadMaplibre().then(() => order.push('resolved'));

    expect(order).toEqual(['worker', 'resolved']);
  });

  it('retries after a failed import', async () => {
    // Re-registered here because the hoisted mock has already loaded, and
    // vitest keeps a mocked module that loaded across `vi.resetModules()`.
    let imports = 0;
    vi.doMock('@/lib/maplibre/subset', () => {
      imports += 1;
      if (imports === 1) throw new Error('chunk failed to load');
      return { Map: MlMap };
    });
    const loadMaplibre = await importLoader();

    const failed = loadMaplibre();
    await expect(failed).rejects.toThrow();

    const retried = loadMaplibre();
    expect(retried).not.toBe(failed);
    expect((await retried).Map).toBe(MlMap);
    expect(imports).toBe(2);
  });
});
