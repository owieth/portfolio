'use client';

import Link from 'next/link';
import { useCallback, useRef, useState } from 'react';

import Pfyl from '@/components/wo-haere/Pfyl';
import Resultatcharte, {
  type Resultat,
} from '@/components/wo-haere/Resultatcharte';
import Stampecharte from '@/components/wo-haere/Stampecharte';
import Wandcharte, {
  type WandcharteHandle,
} from '@/components/wo-haere/Wandcharte';
import Wurfbuech from '@/components/wo-haere/Wurfbuech';
import Wurfsteuerig, {
  type ZugStand,
} from '@/components/wo-haere/Wurfsteuerig';
import Yschtellige from '@/components/wo-haere/Yschtellige';
import Zieuhilf from '@/components/wo-haere/Zieuhilf';
// Attribution is not rendered here: maplibre shows it from the source specs
// (© swisstopo on the raster source, OpenFreeMap/OSM from the world style).
import {
  AKTIONE,
  APP,
  FAEHLER,
  YSCHTELLIGE as YTEXT,
} from '@/lib/wo-haere/data/bern';
import { cn } from '@/lib/wo-haere/cn';
import type { LatLon } from '@/lib/wo-haere/geo/ch';
import type { Wurf } from '@/lib/wo-haere/geo/resolveHit';
import { noechschtsZiu, reaktion } from '@/lib/wo-haere/reactions';
import {
  CASE_STUDY_PATH,
  PLAY_PATH,
  WURF_ENDPOINT,
} from '@/lib/wo-haere/routes';
import { formatWurf } from '@/lib/wo-haere/wurfParam';
import { gsammleteKantöne, useWoHaere } from '@/lib/wo-haere/store';
import {
  chueglogge,
  dernaebe as tonDernaebe,
  thwack,
} from '@/lib/wo-haere/ton';
import type { WurfErgebnis, WurfStil } from '@/lib/wo-haere/throw/mechanics';
import type { WurfEintrag } from '@/lib/wo-haere/types';

interface WoHaereProps {
  /** A throw restored from a shared ?wurf= link. */
  startWurf: LatLon | null;
}

function mitti(el: HTMLElement | null) {
  if (!el) return { x: 0, y: 0 };
  const rect = el.getBoundingClientRect();
  return { x: rect.width / 2, y: rect.height / 2 };
}

export default function WoHaere({ startWurf }: WoHaereProps) {
  const charteRef = useRef<WandcharteHandle | null>(null);
  const { yschtellige, ändere, wurfbuech, merkWurf, leereWurfbuech } =
    useWoHaere();

  const [ziel, setZiel] = useState<{ x: number; y: number } | null>(null);
  const [wurfNr, setWurfNr] = useState(0);
  const [stil, setStil] = useState<WurfStil>('sufer');
  const [wartendOrt, setWartendOrt] = useState<LatLon | null>(null);
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [laufend, setLaufend] = useState(false);
  const [fähler, setFähler] = useState(false);
  const [teiletext, setTeiletext] = useState<string>(AKTIONE.teile);
  const [paneeOffe, setPaneeOffe] = useState(false);
  const [zug, setZug] = useState<ZugStand | null>(null);

  const zeigResultat = useCallback(
    (wurf: Wurf, ort: LatLon) => {
      const nz = wurf.art === 'preich' ? noechschtsZiu(ort) : null;
      const isPreich = Boolean(nz?.isPreich) && wurf.art === 'preich';

      setResultat({
        wurf,
        ziu: nz?.ziu ?? null,
        reaktion: wurf.art === 'preich' ? reaktion(wurf) : '',
        isPreich,
      });

      // A landed dart is taken over by a map marker, which stays pinned to the
      // coordinate while the map moves. A dart that missed has no marker, so it
      // stays on screen to show it hit the wall.
      if (wurf.art === 'preich') setZiel(null);

      if (yschtellige.ton) {
        if (wurf.art === 'dernaebe') tonDernaebe();
        else if (isPreich) chueglogge();
      }

      const eintrag: WurfEintrag = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        zyt: Date.now(),
        wurf,
        ziuName: nz?.ziu.name ?? null,
        isPreich,
      };
      merkWurf(eintrag);
    },
    [merkWurf, yschtellige.ton],
  );

  const holResultat = useCallback(
    async (ort: LatLon) => {
      try {
        const res = await fetch(WURF_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ort),
        });
        if (!res.ok) throw new Error(String(res.status));
        zeigResultat((await res.json()) as Wurf, ort);
      } catch {
        setFähler(true);
      } finally {
        setLaufend(false);
      }
    },
    [zeigResultat],
  );

  const wurf = useCallback(
    ({ zieu, stil: wurfStil }: WurfErgebnis) => {
      if (laufend) return;
      const handle = charteRef.current;
      if (!handle) return;

      setResultat(null);
      setFähler(false);
      setTeiletext(AKTIONE.teile);
      setWurfNr(n => n + 1);
      setStil(wurfStil);

      const container = handle.container();

      if (zieu.kind === 'pixel') {
        const ort = handle.pixelZuOrt(zieu.x, zieu.y);
        setWartendOrt(ort);
        setZiel({ x: zieu.x, y: zieu.y });
        setLaufend(true);
        return;
      }

      // Aim at where the coordinate currently sits on screen; if it is not
      // visible (zoomed out globe, other hemisphere) the dart lands in the
      // middle and the map flies there afterwards.
      const p = handle.ortZuPixel(zieu.ort);
      const rect = container?.getBoundingClientRect();
      const sichtbar =
        p &&
        rect &&
        p.x >= 0 &&
        p.y >= 0 &&
        p.x <= rect.width &&
        p.y <= rect.height;

      setWartendOrt(zieu.ort);
      setZiel(sichtbar ? p : mitti(container));
      setLaufend(true);
    },
    [laufend],
  );

  const gladet = useCallback(() => {
    if (yschtellige.ton) thwack();

    if (!wartendOrt) {
      setResultat({
        wurf: { art: 'dernaebe', grund: 'nid_uf_der_charte', lat: 0, lon: 0 },
        ziu: null,
        reaktion: '',
        isPreich: false,
      });
      if (yschtellige.ton) tonDernaebe();
      setLaufend(false);
      return;
    }

    void holResultat(wartendOrt);
  }, [holResultat, wartendOrt, yschtellige.ton]);

  /**
   * A shared ?wurf= link replays that throw once the map is able to project
   * coordinates — doing it here rather than in an effect avoids racing map
   * initialisation.
   */
  const charteZwaeg = useCallback(() => {
    if (!startWurf) return;
    const handle = charteRef.current;
    handle?.zeigOrt(startWurf);
    setWurfNr(n => n + 1);
    setWartendOrt(startWurf);
    setZiel(
      handle?.ortZuPixel(startWurf) ?? mitti(handle?.container() ?? null),
    );
    setLaufend(true);
  }, [startWurf]);

  const teile = useCallback(async () => {
    if (resultat?.wurf.art !== 'preich') return;
    const { lat, lon } = resultat.wurf;
    const url = `${window.location.origin}${PLAY_PATH}?wurf=${formatWurf({ lat, lon })}`;
    try {
      await navigator.clipboard.writeText(url);
      setTeiletext(AKTIONE.kopiert);
    } catch {
      setTeiletext(url);
    }
  }, [resultat]);

  const gsammlet = gsammleteKantöne(wurfbuech);

  return (
    // gsw is the ISO code for Swiss German — the whole interface is
    // Berndeutsch. <html lang> cannot vary per route under one root layout,
    // so the override lives here.
    <main
      lang="gsw-CH"
      data-panee-offe={paneeOffe || undefined}
      className="relative h-dvh w-full overflow-hidden bg-stone-800"
    >
      <div className="absolute inset-0">
        <Wandcharte
          ref={charteRef}
          aasicht={yschtellige.aasicht}
          wuerf={wurfbuech}
          onZwaeg={charteZwaeg}
        />
        {zug && (
          <Zieuhilf
            vo={zug.vo}
            zeiger={zug.zeiger}
            ziel={zug.ziel}
            chraft={zug.chraft}
            gnue={zug.gnue}
            sigma={zug.sigma}
          />
        )}
        <Pfyl
          key={wurfNr}
          ziel={ziel}
          sorte={yschtellige.pfylsorte}
          stil={stil}
          onGladet={gladet}
        />
      </div>

      <header
        className="pointer-events-none absolute inset-x-0 top-0 z-(--z-steuerig) flex items-start p-4"
        style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
      >
        <div className="pointer-events-auto rounded-xl bg-white/90 px-3 py-2 shadow-lg dark:bg-stone-900/90">
          <h1 className="text-lg leading-none font-black text-stone-900 dark:text-white">
            {APP.name}
          </h1>
          <p className="mt-0.5 text-xs text-pretty text-stone-600 dark:text-stone-400">
            {APP.tagline}
          </p>
          {/* Full-bleed means no site chrome, so this is the only way out. */}
          <Link
            href={CASE_STUDY_PATH}
            className="mt-1 inline-block text-xs text-stone-500 underline underline-offset-2 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:text-stone-400 dark:hover:text-white"
          >
            ← {AKTIONE.zrugg}
          </Link>
        </div>
      </header>

      {/* Lives outside the header, on its own layer: this is the panel's own
          close button, so the panel has to stay off it. The rest of the header
          keeps the layer the panel is free to cover. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-(--z-zue) flex justify-end p-4"
        style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
      >
        <button
          type="button"
          aria-label={YTEXT.titu}
          aria-expanded={paneeOffe}
          onClick={() => setPaneeOffe(o => !o)}
          className="pointer-events-auto grid size-10 place-items-center rounded-xl bg-white/90 text-lg shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:bg-stone-900/90"
        >
          {paneeOffe ? '✕' : '☰'}
        </button>
      </div>

      {paneeOffe && (
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
            onÄndere={ändere}
          />
          <Stampecharte gsammlet={gsammlet} />
          <Wurfbuech
            wurfbuech={wurfbuech}
            onLeere={leereWurfbuech}
            onZeig={eintrag => {
              charteRef.current?.zeigOrt({
                lat: eintrag.wurf.lat,
                lon: eintrag.wurf.lon,
              });
              setPaneeOffe(false);
            }}
          />
        </aside>
      )}

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
            onNomau={() => {
              setResultat(null);
              setZiel(null);
              setWartendOrt(null);
            }}
            onTeile={teile}
            onZeig={() => {
              if (resultat.wurf.art !== 'preich') return;
              charteRef.current?.zeigOrt({
                lat: resultat.wurf.lat,
                lon: resultat.wurf.lon,
              });
            }}
          />
        ) : (
          <Wurfsteuerig
            wurfart={yschtellige.wurfart}
            gsperrt={laufend}
            ton={yschtellige.ton}
            charteRect={() =>
              charteRef.current?.container()?.getBoundingClientRect() ?? null
            }
            onWurf={wurf}
            onZug={setZug}
          />
        )}
      </div>
    </main>
  );
}
