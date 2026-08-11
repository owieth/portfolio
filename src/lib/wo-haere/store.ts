'use client';

import { useCallback, useSyncExternalStore } from 'react';

import {
  STANDARD_YSCHTELLIGE,
  type WurfEintrag,
  type Yschtellige,
} from '@/lib/wo-haere/types';

const KEY_YSCHTELLIGE = 'wo-haere:yschtellige';
const KEY_WURFBUECH = 'wo-haere:wurfbuech';
const MAX_WUERF = 200;

interface Schnappschuss {
  yschtellige: Yschtellige;
  wurfbuech: WurfEintrag[];
}

/**
 * localStorage is an external store, so it is read through
 * useSyncExternalStore rather than copied into state inside an effect.
 * The server snapshot is the defaults, which is what the server renders.
 */
const SERVER: Schnappschuss = {
  yschtellige: STANDARD_YSCHTELLIGE,
  wurfbuech: [],
};

let schnappschuss: Schnappschuss | null = null;
const losenr = new Set<() => void>();

function ladeYschtellige(): Yschtellige {
  try {
    const raw = window.localStorage.getItem(KEY_YSCHTELLIGE);
    return raw
      ? {
          ...STANDARD_YSCHTELLIGE,
          ...(JSON.parse(raw) as Partial<Yschtellige>),
        }
      : STANDARD_YSCHTELLIGE;
  } catch {
    return STANDARD_YSCHTELLIGE;
  }
}

function ladeWurfbuech(): WurfEintrag[] {
  try {
    const raw = window.localStorage.getItem(KEY_WURFBUECH);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as WurfEintrag[]) : [];
  } catch {
    return [];
  }
}

function läse(): Schnappschuss {
  return { yschtellige: ladeYschtellige(), wurfbuech: ladeWurfbuech() };
}

function getSnapshot(): Schnappschuss {
  schnappschuss ??= läse();
  return schnappschuss;
}

function getServerSnapshot(): Schnappschuss {
  return SERVER;
}

function meldi() {
  schnappschuss = läse();
  for (const l of losenr) l();
}

function subscribe(onChange: () => void) {
  losenr.add(onChange);
  // Another tab writing to localStorage should update this one too.
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY_YSCHTELLIGE || e.key === KEY_WURFBUECH) meldi();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    losenr.delete(onChange);
    window.removeEventListener('storage', onStorage);
  };
}

function speichere(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A full or blocked localStorage must never break a dart throw.
  }
  meldi();
}

export function useWoHaere() {
  const { yschtellige, wurfbuech } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const ändere = useCallback((teil: Partial<Yschtellige>) => {
    speichere(KEY_YSCHTELLIGE, { ...ladeYschtellige(), ...teil });
  }, []);

  const merkWurf = useCallback((eintrag: WurfEintrag) => {
    speichere(KEY_WURFBUECH, [eintrag, ...ladeWurfbuech()].slice(0, MAX_WUERF));
  }, []);

  const leereWurfbuech = useCallback(() => {
    speichere(KEY_WURFBUECH, []);
  }, []);

  return { yschtellige, ändere, wurfbuech, merkWurf, leereWurfbuech };
}

/** Cantons that have been hit at least once. */
export function gsammleteKantöne(wurfbuech: WurfEintrag[]): Set<string> {
  const set = new Set<string>();
  for (const eintrag of wurfbuech) {
    if (eintrag.wurf.art === 'preich' && eintrag.wurf.kanton) {
      set.add(eintrag.wurf.kanton);
    }
  }
  return set;
}
