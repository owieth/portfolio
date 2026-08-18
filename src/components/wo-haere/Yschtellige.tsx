'use client';

import { Switch } from '@base-ui/react/switch';

import { track } from '@/lib/analytics/track';
import Wahl, { type WahlOption } from '@/components/wo-haere/Wahl';
import {
  AASICHTE,
  PFYLSORTE,
  WURFARTE,
  YSCHTELLIGE as TEXT,
  type PfylsorteId,
} from '@/lib/wo-haere/data/bern';
import { cn } from '@/lib/wo-haere/cn';
import {
  AASICHT_IDS,
  WURFART_IDS,
  type Aasicht,
  type Wurfart,
  type Yschtellige as YschtelligeWert,
} from '@/lib/wo-haere/types';

interface YschtelligeProps {
  wert: YschtelligeWert;
  aazahlWuerf: number;
  onÄndere: (teil: Partial<YschtelligeWert>) => void;
}

const AASICHT_OPTIONE: WahlOption<Aasicht>[] = AASICHT_IDS.map(id => ({
  id,
  name: AASICHTE[id].name,
  hiuf: AASICHTE[id].hiuf,
}));

const WURFART_OPTIONE: WahlOption<Wurfart>[] = WURFART_IDS.map(id => ({
  id,
  name: WURFARTE[id].name,
  hiuf: WURFARTE[id].hiuf,
}));

export default function Yschtellige({
  wert,
  aazahlWuerf,
  onÄndere,
}: YschtelligeProps) {
  const offeniSorte = PFYLSORTE.filter(s => aazahlWuerf >= s.abNWuerf);

  return (
    <div className="flex flex-col gap-4">
      <Wahl
        label={TEXT.aasicht}
        wert={wert.aasicht}
        optione={AASICHT_OPTIONE}
        onWahl={aasicht => {
          track({
            name: 'setting_changed',
            setting_name: 'view',
            setting_value: aasicht,
          });
          onÄndere({ aasicht });
        }}
      />
      <Wahl
        label={TEXT.wurfart}
        wert={wert.wurfart}
        optione={WURFART_OPTIONE}
        onWahl={wurfart => {
          track({
            name: 'setting_changed',
            setting_name: 'throw_style',
            setting_value: wurfart,
          });
          onÄndere({ wurfart });
        }}
      />

      {offeniSorte.length > 1 && (
        <Wahl
          label={TEXT.pfylsorte}
          wert={wert.pfylsorte}
          optione={offeniSorte.map(s => ({
            id: s.id as PfylsorteId,
            name: `${s.emoji} ${s.name}`,
          }))}
          onWahl={pfylsorte => {
            track({
              name: 'setting_changed',
              setting_name: 'dart_skin',
              setting_value: pfylsorte,
            });
            onÄndere({ pfylsorte });
          }}
        />
      )}

      <label className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-stone-700 dark:text-stone-200">
          {TEXT.ton}
        </span>
        <Switch.Root
          checked={wert.ton}
          onCheckedChange={ton => {
            track({
              name: 'setting_changed',
              setting_name: 'sound',
              setting_value: ton ? 'on' : 'off',
            });
            onÄndere({ ton });
          }}
          className={cn(
            'relative h-6 w-11 shrink-0 rounded-full bg-stone-300 transition-colors duration-150 ease-out',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600',
            'data-[checked]:bg-red-600 dark:bg-stone-700',
          )}
        >
          <Switch.Thumb
            className={cn(
              'block size-5 translate-x-0.5 rounded-full bg-white shadow-sm',
              'transition-transform duration-150 ease-out data-[checked]:translate-x-[22px]',
            )}
          />
        </Switch.Root>
      </label>
    </div>
  );
}
