'use client';

import Stampecharte from '@/components/wo-haere/Stampecharte';
import Wurfbuech from '@/components/wo-haere/Wurfbuech';
import Yschtellige from '@/components/wo-haere/Yschtellige';
import { cn } from '@/lib/wo-haere/cn';
import type {
  Yschtellige as YschtelligeWert,
  WurfEintrag,
} from '@/lib/wo-haere/types';

interface PaneeProps {
  yschtellige: YschtelligeWert;
  wurfbuech: WurfEintrag[];
  gsammlet: Set<string>;
  onÄndere: (teil: Partial<YschtelligeWert>) => void;
  onLeere: () => void;
  onZeig: (eintrag: WurfEintrag) => void;
}

/** The settings drawer: preferences, the canton sheet and the throw log. */
export default function Panee({
  yschtellige,
  wurfbuech,
  gsammlet,
  onÄndere,
  onLeere,
  onZeig,
}: PaneeProps) {
  return (
    <aside
      className={cn(
        'absolute top-0 right-0 z-(--z-panee) flex h-dvh w-[min(20rem,100vw)] flex-col gap-5',
        'overflow-y-auto border-l border-stone-300 bg-white/97 p-4 shadow-2xl',
        'dark:border-stone-700 dark:bg-stone-900/97',
      )}
      style={{
        paddingTop: 'max(4.5rem, calc(env(safe-area-inset-top) + 3.5rem))',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
      }}
    >
      <Yschtellige
        wert={yschtellige}
        aazahlWuerf={wurfbuech.length}
        onÄndere={onÄndere}
      />
      <Stampecharte gsammlet={gsammlet} />
      <Wurfbuech wurfbuech={wurfbuech} onLeere={onLeere} onZeig={onZeig} />
    </aside>
  );
}
