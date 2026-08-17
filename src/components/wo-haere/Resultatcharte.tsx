'use client';

import { motion, useReducedMotion } from 'motion/react';

import {
  AKTIONE,
  DERNAEBE,
  RESULTAT,
  kantonsName,
} from '@/lib/wo-haere/data/bern';
import { cn } from '@/lib/wo-haere/cn';
import type { Ziu } from '@/lib/wo-haere/data/ziu';
import type { Wurf } from '@/lib/wo-haere/geo/resolveHit';

export interface Resultat {
  wurf: Wurf;
  ziu: Ziu | null;
  reaktion: string;
  isPreich: boolean;
}

interface ResultatchartéProps {
  resultat: Resultat;
  onNomau: () => void;
  onTeile: () => void;
  onZeig: () => void;
  teiletext: string;
}

export default function Resultatcharte({
  resultat,
  onNomau,
  onTeile,
  onZeig,
  teiletext,
}: ResultatchartéProps) {
  const reduced = useReducedMotion();
  const { wurf, ziu, reaktion, isPreich } = resultat;

  return (
    <motion.section
      aria-live="polite"
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: reduced ? 0.12 : 0.2, ease: 'easeOut' }}
      className={cn(
        'pointer-events-auto w-full max-w-md rounded-2xl border border-stone-300/80 bg-white/95 p-5 shadow-xl',
        'backdrop-blur-none dark:border-stone-700/80 dark:bg-stone-900/95',
      )}
    >
      {wurf.art === 'dernaebe' ? (
        <>
          <h2 className="text-2xl font-black text-balance text-red-700 dark:text-red-500">
            {DERNAEBE.titu}
          </h2>
          <p className="mt-2 text-pretty text-stone-700 dark:text-stone-300">
            {DERNAEBE[wurf.grund]}
          </p>
        </>
      ) : (
        <>
          {isPreich && (
            <p className="text-sm font-bold tracking-normal text-red-600 uppercase dark:text-red-500">
              🔔 {RESULTAT.preicht}
            </p>
          )}
          <h2 className="text-sm font-semibold text-balance text-stone-500 uppercase dark:text-stone-400">
            {wurf.wasser ? RESULTAT.duLandischIm : RESULTAT.duGaschUf}
          </h2>
          <p className="mt-1 text-3xl font-black text-balance text-stone-900 dark:text-white">
            {ziu?.name ?? wurf.gmeind}
          </p>

          <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-600 dark:text-stone-400">
            {wurf.kanton && (
              <div className="flex gap-1">
                <dt className="sr-only">{RESULTAT.kanton}</dt>
                <dd>
                  {RESULTAT.kanton} {kantonsName(wurf.kanton)}
                </dd>
              </div>
            )}
            {wurf.hoechi !== null && (
              <div className="flex gap-1">
                <dt className="sr-only">Höchi</dt>
                <dd className="tabular-nums">
                  {wurf.hoechi.toLocaleString('de-CH')} {RESULTAT.ueberMeer}
                </dd>
              </div>
            )}
            <div className="flex gap-1">
              <dt className="sr-only">Distanz</dt>
              <dd className="tabular-nums">
                {Math.round(wurf.distanzKm).toLocaleString('de-CH')} km{' '}
                {RESULTAT.voBaern}
                {/* A bearing is meaningless when the dart landed on Bern itself. */}
                {wurf.distanzKm >= 2 ? ` ${wurf.richtig}` : ''}
              </dd>
            </div>
          </dl>

          {ziu && (
            <div className="mt-4 rounded-xl bg-stone-100 p-3 dark:bg-stone-800">
              <h3 className="text-xs font-semibold text-stone-500 uppercase dark:text-stone-400">
                {RESULTAT.wasMachsch}
              </h3>
              <p className="mt-1 text-pretty text-stone-800 dark:text-stone-200">
                {ziu.was}
              </p>
            </div>
          )}

          <p className="mt-3 text-sm text-pretty text-stone-600 dark:text-stone-400">
            {reaktion}
          </p>
        </>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onNomau}
          className={cn(
            'rounded-full bg-red-600 px-5 py-2 font-bold text-white',
            'transition-transform duration-150 ease-out active:scale-95',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700',
          )}
        >
          {AKTIONE.nomau}
        </button>
        {wurf.art === 'preich' && (
          <>
            <button
              type="button"
              onClick={onZeig}
              className="rounded-full border border-stone-300 px-5 py-2 font-medium text-stone-800 transition-colors duration-150 ease-out hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:border-stone-600 dark:text-stone-100 dark:hover:bg-stone-800"
            >
              {AKTIONE.ufDCharte}
            </button>
            <button
              type="button"
              onClick={onTeile}
              className="rounded-full border border-stone-300 px-5 py-2 font-medium text-stone-800 transition-colors duration-150 ease-out hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:border-stone-600 dark:text-stone-100 dark:hover:bg-stone-800"
            >
              {teiletext}
            </button>
          </>
        )}
      </div>
    </motion.section>
  );
}
