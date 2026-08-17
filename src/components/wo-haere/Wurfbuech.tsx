'use client';

import { AlertDialog } from '@base-ui/react/alert-dialog';

import { WURFBUECH as TEXT, kantonsName } from '@/lib/wo-haere/data/bern';
import { cn } from '@/lib/wo-haere/cn';
import type { WurfEintrag } from '@/lib/wo-haere/types';

interface WurfbuechProps {
  wurfbuech: WurfEintrag[];
  onZeig: (eintrag: WurfEintrag) => void;
  onLeere: () => void;
}

export default function Wurfbuech({
  wurfbuech,
  onZeig,
  onLeere,
}: WurfbuechProps) {
  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-xs font-semibold text-stone-500 uppercase dark:text-stone-400">
          {TEXT.titu}
        </h2>
        <span className="text-xs text-stone-500 tabular-nums dark:text-stone-400">
          {TEXT.wuerf(wurfbuech.length)}
        </span>
      </div>

      {wurfbuech.length === 0 ? (
        <p className="text-sm text-pretty text-stone-500 dark:text-stone-400">
          {TEXT.leer}
        </p>
      ) : (
        <>
          <ul className="min-h-0 flex-1 divide-y divide-stone-200 overflow-y-auto dark:divide-stone-700">
            {wurfbuech.map(eintrag => (
              <li key={eintrag.id}>
                <button
                  type="button"
                  onClick={() => onZeig(eintrag)}
                  className="flex w-full items-baseline justify-between gap-2 py-1.5 text-left text-sm hover:text-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:hover:text-red-500"
                >
                  <span className="truncate text-stone-800 dark:text-stone-200">
                    {eintrag.isPreich && '🔔 '}
                    {eintrag.wurf.art === 'preich'
                      ? (eintrag.ziuName ?? eintrag.wurf.gmeind)
                      : TEXT.titu}
                  </span>
                  <span className="shrink-0 text-xs text-stone-500 dark:text-stone-400">
                    {eintrag.wurf.art === 'preich' && eintrag.wurf.kanton
                      ? kantonsName(eintrag.wurf.kanton)
                      : '—'}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <AlertDialog.Root>
            <AlertDialog.Trigger
              className={cn(
                'self-start text-xs font-medium text-stone-500 underline underline-offset-2',
                'hover:text-red-700 focus-visible:outline-2 focus-visible:outline-offset-2',
                'focus-visible:outline-red-600 dark:text-stone-400 dark:hover:text-red-500',
              )}
            >
              {TEXT.leere}
            </AlertDialog.Trigger>
            <AlertDialog.Portal>
              <AlertDialog.Backdrop className="fixed inset-0 z-(--z-vorhang) bg-black/40" />
              <AlertDialog.Popup
                className={cn(
                  'fixed top-1/2 left-1/2 z-(--z-dialog) w-[min(24rem,calc(100vw-2rem))]',
                  '-translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-5 shadow-2xl',
                  'dark:bg-stone-900',
                )}
              >
                <AlertDialog.Title className="text-lg font-bold text-stone-900 dark:text-white">
                  {TEXT.sicher}
                </AlertDialog.Title>
                <AlertDialog.Description className="mt-1 text-sm text-pretty text-stone-600 dark:text-stone-400">
                  {TEXT.sicherText}
                </AlertDialog.Description>
                <div className="mt-4 flex justify-end gap-2">
                  <AlertDialog.Close className="rounded-full border border-stone-300 px-4 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800">
                    Nei
                  </AlertDialog.Close>
                  <AlertDialog.Close
                    onClick={onLeere}
                    className="rounded-full bg-red-600 px-4 py-1.5 text-sm font-bold text-white hover:bg-red-700"
                  >
                    {TEXT.jaLeere}
                  </AlertDialog.Close>
                </div>
              </AlertDialog.Popup>
            </AlertDialog.Portal>
          </AlertDialog.Root>
        </>
      )}
    </div>
  );
}
