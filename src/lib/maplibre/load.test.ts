import { describe, expect, it, vi } from 'vitest';

const MlMap = vi.hoisted(() => vi.fn());
const worker = vi.hoisted(() => ({ loads: 0, ensureMaplibreWorker: vi.fn() }));

vi.mock('/maplibre/maplibre-gl.mjs', () => ({ Map: MlMap }));
vi.mock('@/lib/maplibre/worker', () => {
  worker.loads += 1;
  return { ensureMaplibreWorker: worker.ensureMaplibreWorker };
});

/**
 * The memo lives at module scope, so each case re-imports the loader after
 * `vi.resetModules()` to start with nothing loaded. Mocked modules survive
 * that reset, so every case shares one `MlMap` and one `ensureMaplibreWorker`.
 */
const importLoader = async () => {
  vi.resetModules();
  return (await import('@/lib/maplibre/load')).loadMaplibre;
};

describe('loadMaplibre', () => {
  it('returns one promise however often it is called', async () => {
    const loadMaplibre = await importLoader();

    const first = loadMaplibre();
    expect(loadMaplibre()).toBe(first);

    const maplibre = await first;
    expect(loadMaplibre()).toBe(first);
    expect(maplibre.Map).toBe(MlMap);
  });

  it('does not configure the bundled worker', async () => {
    const loadMaplibre = await importLoader();

    await loadMaplibre();

    // Importing `worker.ts` at all, called or not, would bundle MapLibre back
    // into /stats.
    expect(worker.loads).toBe(0);
    expect(worker.ensureMaplibreWorker).not.toHaveBeenCalled();
  });

  it('retries after a failed import', async () => {
    // Re-registered here because the hoisted mock has already loaded, and
    // vitest keeps a mocked module that loaded across `vi.resetModules()`.
    let imports = 0;
    vi.doMock('/maplibre/maplibre-gl.mjs', () => {
      imports += 1;
      if (imports === 1) throw new Error('module failed to load');
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
