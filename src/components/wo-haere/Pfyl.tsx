'use client';

import { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';

import { PFYLSORTE, type PfylsorteId } from '@/lib/wo-haere/data/bern';
import type { WurfStil } from '@/lib/wo-haere/throw/mechanics';

/**
 * The dart in flight.
 *
 * Callers remount this per throw with a `key`, so the landed state resets
 * without an effect.
 */
interface PfylProps {
  /** Target pixel inside the map container, or null while no dart is in flight. */
  ziel: { x: number; y: number } | null;
  sorte: PfylsorteId;
  stil: WurfStil;
  onGladet: () => void;
}

const EMOJI: Record<PfylsorteId, string> = Object.fromEntries(
  PFYLSORTE.map(s => [s.id, s.emoji]),
) as Record<PfylsorteId, string>;

/** Where the dart is thrown from, relative to its target. */
const WURF_HÖCHI = 280;

interface Bahn {
  x: number[];
  y: number[];
  rotate: number[];
  scale: number[];
  times: number[];
  dauer: number;
  /** Resting angle — a bad throw stays stuck crooked. */
  ligt: number;
}

/**
 * Flight path per throw quality. A clean throw goes more or less straight; a
 * shanked one ("Chnorz") sails past the target, tumbles end over end and
 * flutters back to stick in at a silly angle.
 */
function bahnFür(ziel: { x: number; y: number }, stil: WurfStil): Bahn {
  const vo = { x: ziel.x, y: ziel.y + WURF_HÖCHI };
  const dreh = Math.random() < 0.5 ? -1 : 1;

  if (stil === 'sufer') {
    return {
      x: [vo.x, (vo.x + ziel.x) / 2 + dreh * 10, ziel.x],
      y: [vo.y, (vo.y + ziel.y) / 2 - 26, ziel.y],
      rotate: [0, dreh * 24, 0],
      scale: [2.1, 1.3, 0.85],
      times: [0, 0.55, 1],
      dauer: 0.62,
      ligt: 0,
    };
  }

  if (stil === 'gschlämpert') {
    return {
      x: [vo.x, vo.x + dreh * 54, ziel.x - dreh * 22, ziel.x],
      y: [vo.y, vo.y - WURF_HÖCHI * 0.55, ziel.y - 34, ziel.y],
      rotate: [0, dreh * 200, dreh * 330, dreh * 372],
      scale: [2.1, 1.5, 1, 0.85],
      times: [0, 0.4, 0.78, 1],
      dauer: 0.86,
      ligt: dreh * 12,
    };
  }

  // Chnorz: overshoots the target, spirals, then drops back onto it.
  const über = {
    x: ziel.x + dreh * 96,
    y: ziel.y - 84,
  };
  return {
    x: [vo.x, vo.x - dreh * 70, über.x, ziel.x + dreh * 30, ziel.x],
    y: [vo.y, vo.y - WURF_HÖCHI * 0.7, über.y, ziel.y - 46, ziel.y],
    rotate: [0, dreh * 260, dreh * 620, dreh * 860, dreh * 1000],
    scale: [2.1, 1.55, 1.1, 0.95, 0.85],
    times: [0, 0.32, 0.6, 0.84, 1],
    dauer: 1.35,
    ligt: dreh * 62,
  };
}

export default function Pfyl({ ziel, sorte, stil, onGladet }: PfylProps) {
  const reduced = useReducedMotion();
  const [gladet, setGladet] = useState(false);

  // Recomputed only per mount, so the wobble phase cannot reshuffle the path.
  const bahn = useMemo(
    () => (ziel ? bahnFür(ziel, stil) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  if (!ziel || !bahn) return null;

  const wobble = stil === 'chnorz' ? [0, -22, 15, -8, 0] : [0, -14, 9, -4, 0];

  return (
    <motion.div
      className="pointer-events-none absolute top-0 left-0 z-(--z-pfyl) will-change-transform"
      initial={
        reduced
          ? { opacity: 0, x: ziel.x, y: ziel.y, scale: 1, rotate: 0 }
          : {
              opacity: 1,
              x: bahn.x[0],
              y: bahn.y[0],
              scale: bahn.scale[0],
              rotate: 0,
            }
      }
      animate={
        gladet
          ? {
              opacity: 1,
              x: ziel.x,
              y: ziel.y,
              scale: 1,
              rotate: reduced ? 0 : wobble.map(w => bahn.ligt + w),
            }
          : reduced
            ? { opacity: 1, x: ziel.x, y: ziel.y, scale: 1, rotate: 0 }
            : {
                opacity: 1,
                x: bahn.x,
                y: bahn.y,
                scale: bahn.scale,
                rotate: bahn.rotate,
              }
      }
      transition={
        gladet
          ? { duration: reduced ? 0 : 0.38, ease: 'easeOut' }
          : {
              duration: reduced ? 0.12 : bahn.dauer,
              ease: 'easeOut',
              times: reduced ? undefined : bahn.times,
            }
      }
      onAnimationComplete={() => {
        if (gladet) return;
        setGladet(true);
        onGladet();
      }}
      aria-hidden="true"
    >
      <span className="block -translate-x-1/2 -translate-y-[90%] text-3xl select-none">
        {EMOJI[sorte] ?? '🎯'}
      </span>
    </motion.div>
  );
}
