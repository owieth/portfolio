'use client';

import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';

import { cn } from '@/lib/wo-haere/cn';

export interface WahlOption<T extends string> {
  id: T;
  name: string;
  hiuf?: string;
}

interface WahlProps<T extends string> {
  label: string;
  wert: T;
  optione: readonly WahlOption<T>[];
  onWahl: (wert: T) => void;
}

/**
 * Segmented control built on a radio group, so arrow keys and screen readers
 * behave the way they should for an exclusive choice.
 */
export default function Wahl<T extends string>({
  label,
  wert,
  optione,
  onWahl,
}: WahlProps<T>) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-stone-500 uppercase dark:text-stone-400">
        {label}
      </span>
      <RadioGroup
        aria-label={label}
        value={wert}
        onValueChange={next => onWahl(next as T)}
        className="flex gap-1 rounded-lg bg-stone-200 p-1 dark:bg-stone-800"
      >
        {optione.map(option => (
          <Radio.Root
            key={option.id}
            value={option.id}
            title={option.hiuf}
            className={cn(
              'flex-1 cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium',
              'text-stone-600 transition-colors duration-150 ease-out',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600',
              'dark:text-stone-300',
              'data-[checked]:bg-white data-[checked]:text-stone-900 data-[checked]:shadow-sm',
              'dark:data-[checked]:bg-stone-950 dark:data-[checked]:text-white',
            )}
          >
            {option.name}
          </Radio.Root>
        ))}
      </RadioGroup>
    </div>
  );
}
