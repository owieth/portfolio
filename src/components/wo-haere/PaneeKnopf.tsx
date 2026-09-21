'use client';

import { track } from '@/lib/analytics/track';
import { YSCHTELLIGE as YTEXT } from '@/lib/wo-haere/data/bern';

interface PaneeKnopfProps {
  offe: boolean;
  onWächsle: (offe: boolean) => void;
}

/**
 * Lives outside the header, on its own layer: this is the panel's own close
 * button, so the panel has to stay off it. The rest of the header keeps the
 * layer the panel is free to cover.
 */
export default function PaneeKnopf({ offe, onWächsle }: PaneeKnopfProps) {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-(--z-zue) flex justify-end p-4"
      style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
    >
      <button
        type="button"
        aria-label={YTEXT.titu}
        aria-expanded={offe}
        onClick={() => {
          track({ name: 'panel_toggle', open: !offe });
          onWächsle(!offe);
        }}
        className="pointer-events-auto grid size-10 place-items-center rounded-xl bg-white/90 text-lg shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:bg-stone-900/90"
      >
        {offe ? '✕' : '☰'}
      </button>
    </div>
  );
}
