'use client';

import {
  AUI_KANTOEN,
  KANTOEN,
  STAEMPFEL as TEXT,
} from '@/lib/wo-haere/data/bern';
import { cn } from '@/lib/wo-haere/cn';

interface StampecharteProps {
  gsammlet: Set<string>;
}

export default function Stampecharte({ gsammlet }: StampecharteProps) {
  const auiDa = gsammlet.size === AUI_KANTOEN.length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-xs font-semibold text-stone-500 uppercase dark:text-stone-400">
          {TEXT.titu}
        </h2>
        <span className="text-xs text-stone-500 tabular-nums dark:text-stone-400">
          {TEXT.gsammlet(gsammlet.size)}
        </span>
      </div>

      <ul className="grid grid-cols-7 gap-1">
        {AUI_KANTOEN.map(abbr => {
          const hesch = gsammlet.has(abbr);
          return (
            <li key={abbr}>
              <span
                title={KANTOEN[abbr]}
                className={cn(
                  'grid aspect-square place-items-center rounded-md text-[11px] font-bold tabular-nums',
                  hesch
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'bg-stone-200 text-stone-400 dark:bg-stone-800 dark:text-stone-600',
                )}
              >
                {abbr}
                <span className="sr-only">
                  {KANTOEN[abbr]} {hesch ? 'preicht' : 'no nid preicht'}
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      {auiDa && (
        <p className="text-sm font-medium text-pretty text-red-700 dark:text-red-500">
          {TEXT.auiGsammlet}
        </p>
      )}
      {!auiDa && (
        <p className="text-xs text-pretty text-stone-500 dark:text-stone-400">
          {TEXT.hiuf}
        </p>
      )}
    </div>
  );
}
