'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { AKTIONE, WURFARTE } from '@/lib/wo-haere/data/bern';
import { cn } from '@/lib/wo-haere/cn';
import { startZieh, whoosh, type ZiehTon } from '@/lib/wo-haere/ton';
import {
  MAX_ZUG_PX,
  nöieWind,
  streuigSigma,
  tippZieu,
  vorschau,
  zugZieu,
  type WurfErgebnis,
  type Zug,
  type ZugArt,
} from '@/lib/wo-haere/throw/mechanics';
import type { Wurfart } from '@/lib/wo-haere/types';

export interface ZugStand {
  vo: { x: number; y: number };
  zeiger: { x: number; y: number };
  ziel: { x: number; y: number };
  chraft: number;
  gnue: boolean;
  /** 1σ of the expected miss, drawn as the uncertainty ring. */
  sigma: number;
}

interface WurfsteuerigProps {
  wurfart: Wurfart;
  gsperrt: boolean;
  ton: boolean;
  /** Bounding box of the map, so the handle can locate itself inside it. */
  charteRect: () => DOMRect | null;
  onWurf: (erg: WurfErgebnis) => void;
  /** Live drag state, so the parent can render the aim preview. */
  onZug: (stand: ZugStand | null) => void;
}

/** Hints sit on top of the map, so they need their own backing to stay legible. */
const HIUF =
  'rounded-full bg-white/85 px-3 py-1 text-xs text-stone-700 shadow-sm dark:bg-stone-900/85 dark:text-stone-300';

const ZUG_ART: Record<'zieh' | 'schlüder', ZugArt> = {
  zieh: 'zrugg',
  schlüder: 'häre',
};

export default function Wurfsteuerig({
  wurfart,
  gsperrt,
  ton,
  charteRect,
  onWurf,
  onZug,
}: WurfsteuerigProps) {
  const [chraft, setChraft] = useState(0);
  const [zieht, setZieht] = useState(false);
  const handleRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const voRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const letschtRef = useRef<Zug | null>(null);
  const ziehTonRef = useRef<ZiehTon | null>(null);

  const tonUs = useCallback(() => {
    ziehTonRef.current?.stop();
    ziehTonRef.current = null;
  }, []);

  // A drag interrupted by unmounting must not leave an oscillator running.
  useEffect(() => tonUs, [tonUs]);

  const art = wurfart === 'schlüder' ? ZUG_ART.schlüder : ZUG_ART.zieh;

  /** The dart's resting spot, in map-container pixels. */
  const startPixel = useCallback(() => {
    const h = handleRef.current?.getBoundingClientRect();
    const c = charteRect();
    if (!h || !c) return { x: 0, y: 0 };
    return {
      x: h.left + h.width / 2 - c.left,
      y: h.top + h.height / 2 - c.top,
    };
  }, [charteRect]);

  /** The map is the dartboard; its radius sets the scale of the miss. */
  const brettRadius = useCallback(() => {
    const c = charteRect();
    if (!c) return 200;
    return Math.min(c.width, c.height) / 2;
  }, [charteRect]);

  const zugVo = useCallback((clientX: number, clientY: number): Zug | null => {
    const start = startRef.current;
    if (!start) return null;
    return {
      vo: voRef.current,
      delta: { x: clientX - start.x, y: clientY - start.y },
    };
  }, []);

  const aafah = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (gsperrt) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      startRef.current = { x: e.clientX, y: e.clientY };
      voRef.current = startPixel();
      letschtRef.current = null;
      setZieht(true);
      setChraft(0);
      // The pointer press is the gesture that lets audio start at all.
      if (ton) ziehTonRef.current = startZieh();
    },
    [gsperrt, startPixel, ton],
  );

  const bewege = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!zieht) return;
      const zug = zugVo(e.clientX, e.clientY);
      if (!zug) return;
      letschtRef.current = zug;

      const v = vorschau(zug, art);
      setChraft(v.chraft);
      ziehTonRef.current?.update(v.chraft);
      onZug({
        vo: zug.vo,
        zeiger: { x: zug.vo.x + zug.delta.x, y: zug.vo.y + zug.delta.y },
        ziel: v.ziel,
        chraft: v.chraft,
        gnue: v.gnue,
        sigma: streuigSigma(brettRadius(), v.chraft),
      });
    },
    [art, brettRadius, onZug, zieht, zugVo],
  );

  const loslah = useCallback(() => {
    if (!zieht) return;
    setZieht(false);
    setChraft(0);
    onZug(null);
    tonUs();
    startRef.current = null;

    const zug = letschtRef.current;
    letschtRef.current = null;
    if (!zug) return;

    const v = vorschau(zug, art);
    if (!v.gnue) return;

    const erg = zugZieu(zug, art, nöieWind(), brettRadius());
    if (ton) whoosh(v.chraft, erg.stil === 'chnorz');
    onWurf(erg);
  }, [art, brettRadius, onWurf, onZug, ton, tonUs, zieht]);

  if (wurfart === 'tipp') {
    return (
      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          disabled={gsperrt}
          onClick={() => {
            const erg = tippZieu(nöieWind());
            if (ton) whoosh(0.7, erg.stil === 'chnorz');
            onWurf(erg);
          }}
          className={cn(
            'rounded-full bg-red-600 px-8 py-4 text-lg font-bold text-white shadow-lg',
            'transition-transform duration-150 ease-out active:scale-95',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700',
            'disabled:opacity-50',
          )}
        >
          {AKTIONE.schmeisse}
        </button>
        <p className={HIUF}>{WURFARTE.tipp.hiuf}</p>
      </div>
    );
  }

  const hiuf =
    wurfart === 'schlüder' ? WURFARTE.schlüder.hiuf : WURFARTE.zieh.hiuf;

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Grab the dart and drag: direction aims, length is the force. Pointer
          capture means the drag continues anywhere on screen, so the map keeps
          its own panning outside this handle. */}
      <div
        ref={handleRef}
        role="button"
        tabIndex={0}
        aria-label={hiuf}
        aria-disabled={gsperrt}
        onPointerDown={aafah}
        onPointerMove={bewege}
        onPointerUp={loslah}
        onPointerCancel={loslah}
        onKeyDown={e => {
          if (gsperrt) return;
          if (e.key !== 'Enter' && e.key !== ' ') return;
          // Keyboard fallback: a straight, medium-force throw up the map.
          e.preventDefault();
          const vo = startPixel();
          const erg = zugZieu(
            { vo, delta: { x: 0, y: art === 'zrugg' ? 120 : -120 } },
            art,
            nöieWind(),
            brettRadius(),
          );
          if (ton) whoosh(0.57, erg.stil === 'chnorz');
          onWurf(erg);
        }}
        className={cn(
          'relative grid size-24 touch-none place-items-center rounded-full',
          'border-4 border-dashed border-red-600 bg-white/85 text-4xl shadow-lg select-none',
          'cursor-grab dark:bg-stone-900/85',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600',
          zieht && 'cursor-grabbing border-solid',
          gsperrt && 'opacity-50',
        )}
      >
        🎯
        {zieht && (
          <span
            className="pointer-events-none absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white tabular-nums"
            aria-hidden="true"
          >
            {Math.round(chraft * 100)}%
          </span>
        )}
      </div>

      <div
        className="h-2 w-40 overflow-hidden rounded-full bg-stone-300/80 dark:bg-stone-700/80"
        role="progressbar"
        aria-label={WURFARTE.zieh.name}
        aria-valuenow={Math.round(chraft * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full origin-left rounded-full bg-red-600"
          style={{ transform: `scaleX(${chraft})` }}
        />
      </div>

      <p className={HIUF}>{zieht ? AKTIONE.loslah : hiuf}</p>
    </div>
  );
}

export { MAX_ZUG_PX };
