'use client';

import { useSyncExternalStore } from 'react';

import { formatZurichDate, formatZurichTime } from '@/lib/clock';

/**
 * The current time is an external store: one timer, aligned to the second,
 * runs while any clock is mounted. `null` until the first subscriber, and
 * again after the last one leaves, so a remount never shows a stale time and
 * the server and hydration renders agree on an empty wrapper.
 */
let now: number | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function scheduleTick() {
  timer = setTimeout(tick, 1000 - (Date.now() % 1000));
}

function tick() {
  now = Date.now();
  for (const l of listeners) l();
  scheduleTick();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  if (listeners.size === 1) {
    now = Date.now();
    scheduleTick();
  }
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) {
      clearTimeout(timer);
      now = null;
    }
  };
}

function getSnapshot() {
  return now;
}

function getServerSnapshot() {
  return null;
}

const Clock = () => {
  const ms = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <div className="flex flex-col items-center gap-8 font-mono tabular-nums">
      {ms !== null && (
        <>
          <time dateTime={new Date(ms).toISOString()} className="text-6xl">
            {formatZurichTime(ms)}
          </time>
          <time dateTime={new Date(ms).toISOString()}>
            {formatZurichDate(ms)}
          </time>
        </>
      )}
    </div>
  );
};

export default Clock;
