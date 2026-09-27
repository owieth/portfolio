import { afterEach, describe, expect, it, vi } from 'vitest';

import { STANDARD_YSCHTELLIGE, type WurfEintrag } from '@/lib/wo-haere/types';

const hooks = vi.hoisted(() => ({
  subscribe: null as ((onChange: () => void) => () => void) | null,
}));

vi.mock('react', () => ({
  useSyncExternalStore: (
    subscribe: (cb: () => void) => () => void,
    get: () => unknown,
  ) => {
    hooks.subscribe = subscribe;
    return get();
  },
  useCallback: <T>(f: T) => f,
}));

type FakeStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type StorageHandler = (e: Pick<StorageEvent, 'key'>) => void;

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

const blockedStorage = (): FakeStorage => {
  const blocked = () => {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  };
  return { getItem: blocked, setItem: blocked, removeItem: blocked };
};

const fullStorage = (): FakeStorage => ({
  ...makeStorage(),
  setItem: () => {
    throw new DOMException(
      'The quota has been exceeded.',
      'QuotaExceededError',
    );
  },
});

/**
 * `store.ts` reads `window` lazily, so the stub only has to be in place before
 * the hook first runs. The `storage` handler is kept so a test can fire it.
 */
const stubWindow = (localStorage: FakeStorage) => {
  const storageHandlers = new Set<StorageHandler>();
  vi.stubGlobal('window', {
    localStorage,
    addEventListener: (type: string, handler: StorageHandler) => {
      if (type === 'storage') storageHandlers.add(handler);
    },
    removeEventListener: (type: string, handler: StorageHandler) => {
      if (type === 'storage') storageHandlers.delete(handler);
    },
  });
  return storageHandlers;
};

/** The snapshot is module state, so every test starts from a fresh import. */
const importStore = async () =>
  (await import('@/lib/wo-haere/store')).useWoHaere;

const wurf = (id: string): WurfEintrag => ({
  id,
  zyt: 0,
  ziuName: null,
  isPreich: false,
  wurf: { art: 'dernaebe', grund: 'usland', lat: 0, lon: 0 },
});

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  hooks.subscribe = null;
});

describe('useWoHaere', () => {
  it('keeps a settings change when localStorage is blocked', async () => {
    stubWindow(blockedStorage());
    const useWoHaere = await importStore();

    useWoHaere().ändere({ ton: true });

    expect(useWoHaere().yschtellige.ton).toBe(true);
  });

  it('keeps a throw when localStorage is blocked', async () => {
    stubWindow(blockedStorage());
    const useWoHaere = await importStore();

    useWoHaere().merkWurf(wurf('a'));

    expect(useWoHaere().wurfbuech).toHaveLength(1);
  });

  it('keeps writes when localStorage is full', async () => {
    stubWindow(fullStorage());
    const useWoHaere = await importStore();

    useWoHaere().ändere({ ton: true });
    useWoHaere().merkWurf(wurf('a'));

    expect(useWoHaere().yschtellige.ton).toBe(true);
    expect(useWoHaere().wurfbuech).toHaveLength(1);
  });

  it('persists settings and throws when localStorage works', async () => {
    const localStorage = makeStorage();
    stubWindow(localStorage);
    const useWoHaere = await importStore();

    useWoHaere().ändere({ ton: true });
    useWoHaere().merkWurf(wurf('a'));

    expect(JSON.parse(localStorage.getItem('wo-haere:yschtellige')!)).toEqual({
      ...STANDARD_YSCHTELLIGE,
      ton: true,
    });
    expect(JSON.parse(localStorage.getItem('wo-haere:wurfbuech')!)).toEqual([
      wurf('a'),
    ]);
  });

  it('keeps the throw log identity on a settings-only change', async () => {
    stubWindow(makeStorage());
    const useWoHaere = await importStore();
    useWoHaere().merkWurf(wurf('a'));
    const vorher = useWoHaere().wurfbuech;

    useWoHaere().ändere({ ton: true });

    expect(useWoHaere().wurfbuech).toBe(vorher);
  });

  it('keeps the settings identity when a throw is logged', async () => {
    stubWindow(
      makeStorage({ 'wo-haere:yschtellige': JSON.stringify({ ton: true }) }),
    );
    const useWoHaere = await importStore();
    const vorher = useWoHaere().yschtellige;

    useWoHaere().merkWurf(wurf('a'));

    expect(useWoHaere().yschtellige).toBe(vorher);
  });

  it('caps the throw log at 200 entries, newest first', async () => {
    stubWindow(makeStorage());
    const useWoHaere = await importStore();
    const { merkWurf } = useWoHaere();

    for (let i = 0; i <= 200; i++) merkWurf(wurf(String(i)));

    const { wurfbuech } = useWoHaere();
    expect(wurfbuech).toHaveLength(200);
    expect(wurfbuech[0].id).toBe('200');
    expect(wurfbuech.at(-1)!.id).toBe('1');
  });

  it('empties the throw log when localStorage is blocked', async () => {
    stubWindow(blockedStorage());
    const useWoHaere = await importStore();
    useWoHaere().merkWurf(wurf('a'));
    expect(useWoHaere().wurfbuech).toHaveLength(1);

    useWoHaere().leereWurfbuech();

    expect(useWoHaere().wurfbuech).toHaveLength(0);
  });
});
