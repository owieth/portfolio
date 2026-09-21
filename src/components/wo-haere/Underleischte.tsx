'use client';

import Resultatcharte, {
  type Resultat,
} from '@/components/wo-haere/Resultatcharte';
import Wurfsteuerig, {
  type ZugStand,
} from '@/components/wo-haere/Wurfsteuerig';
import { FAEHLER } from '@/lib/wo-haere/data/bern';
import type { WurfErgebnis } from '@/lib/wo-haere/throw/mechanics';
import type { Yschtellige as YschtelligeWert } from '@/lib/wo-haere/types';

interface UnderleischteProps {
  yschtellige: YschtelligeWert;
  resultat: Resultat | null;
  teiletext: string;
  fähler: boolean;
  laufend: boolean;
  charteRect: () => DOMRect | null;
  onWurf: (ergebnis: WurfErgebnis) => void;
  onZug: (zug: ZugStand | null) => void;
  onNomau: () => void;
  onTeile: () => void;
  onZeig: () => void;
}

/** The throw controls, or the result card once a dart has landed. */
export default function Underleischte({
  yschtellige,
  resultat,
  teiletext,
  fähler,
  laufend,
  charteRect,
  onWurf,
  onZug,
  onNomau,
  onTeile,
  onZeig,
}: UnderleischteProps) {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-(--z-steuerig) flex flex-col items-center gap-3 p-4"
      style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
    >
      {fähler && (
        <div
          role="alert"
          className="pointer-events-auto w-full max-w-md rounded-xl border border-red-300 bg-white/95 p-4 shadow-xl dark:border-red-800 dark:bg-stone-900/95"
        >
          <h2 className="font-bold text-red-700 dark:text-red-500">
            {FAEHLER.titu}
          </h2>
          <p className="mt-1 text-sm text-pretty text-stone-700 dark:text-stone-300">
            {FAEHLER.swisstopo}
          </p>
        </div>
      )}

      {resultat ? (
        <Resultatcharte
          resultat={resultat}
          teiletext={teiletext}
          onNomau={onNomau}
          onTeile={onTeile}
          onZeig={onZeig}
        />
      ) : (
        <Wurfsteuerig
          wurfart={yschtellige.wurfart}
          gsperrt={laufend}
          ton={yschtellige.ton}
          charteRect={charteRect}
          onWurf={onWurf}
          onZug={onZug}
        />
      )}
    </div>
  );
}
