'use client';

import { LazyMotion, domAnimation } from 'motion/react';
import { useCallback, useRef, useState } from 'react';

import { track } from '@/lib/analytics/track';
import Chopf from '@/components/wo-haere/Chopf';
import Panee from '@/components/wo-haere/Panee';
import PaneeKnopf from '@/components/wo-haere/PaneeKnopf';
import Pfyl from '@/components/wo-haere/Pfyl';
import type { Resultat } from '@/components/wo-haere/Resultatcharte';
import Underleischte from '@/components/wo-haere/Underleischte';
import Wandcharte, {
  type WandcharteHandle,
} from '@/components/wo-haere/Wandcharte';
import type { ZugStand } from '@/components/wo-haere/Wurfsteuerig';
import Zieuhilf from '@/components/wo-haere/Zieuhilf';
// Attribution is not rendered here: maplibre shows it from the source specs
// (© swisstopo on the raster source, OpenFreeMap/OSM from the world style).
import type { LatLon } from '@/lib/wo-haere/geo/ch';
import type { Wurf } from '@/lib/wo-haere/geo/resolveHit';
import { noechschtsZiu, reaktion } from '@/lib/wo-haere/reactions';
import { WURF_ENDPOINT } from '@/lib/wo-haere/routes';
import { spurWurf } from '@/lib/wo-haere/spurWurf';
import { gsammleteKantöne, useWoHaere } from '@/lib/wo-haere/store';
import { useTeile } from '@/lib/wo-haere/useTeile';
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
  // The throw's own style, captured at launch so the completion event can carry
  // it once the API resolves — a ref so `zeigResultat` need not depend on it.
  const stilRef = useRef<WurfStil>('sufer');
  // Where the dart is headed, captured at launch and read back once the flight
  // animation completes — a ref for the same reason as `stilRef`: nothing
  // renders it, so committing it would only re-render the whole game.
  const wartendOrtRef = useRef<LatLon | null>(null);
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [laufend, setLaufend] = useState(false);
  const [fähler, setFähler] = useState(false);
  const [paneeOffe, setPaneeOffe] = useState(false);
  const [zug, setZug] = useState<ZugStand | null>(null);
  const {
    teiletext,
    teile,
    zrugg: teiletextZrugg,
  } = useTeile(resultat?.wurf ?? null);

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

      spurWurf({ wurf, stil: stilRef.current, vorher: wurfbuech });
    },
    [merkWurf, wurfbuech, yschtellige.ton],
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
      } catch (error) {
        setFähler(true);
        const status =
          error instanceof Error ? Number.parseInt(error.message, 10) : NaN;
        track({
          name: 'throw_api_error',
          status: Number.isNaN(status) ? null : status,
        });
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
      teiletextZrugg();
      setWurfNr(n => n + 1);
      setStil(wurfStil);
      stilRef.current = wurfStil;

      const container = handle.container();

      if (zieu.kind === 'pixel') {
        const ort = handle.pixelZuOrt(zieu.x, zieu.y);
        wartendOrtRef.current = ort;
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

      wartendOrtRef.current = zieu.ort;
      setZiel(sichtbar ? p : mitti(container));
      setLaufend(true);
    },
    [laufend, teiletextZrugg],
  );

  const gladet = useCallback(() => {
    if (yschtellige.ton) thwack();

    const ort = wartendOrtRef.current;

    if (!ort) {
      setResultat({
        wurf: { art: 'dernaebe', grund: 'nid_uf_der_charte', lat: 0, lon: 0 },
        ziu: null,
        reaktion: '',
        isPreich: false,
      });
      if (yschtellige.ton) tonDernaebe();
      setLaufend(false);
      track({ name: 'throw_off_map' });
      return;
    }

    void holResultat(ort);
  }, [holResultat, yschtellige.ton]);

  /**
   * A shared ?wurf= link replays that throw once the map is able to project
   * coordinates — doing it here rather than in an effect avoids racing map
   * initialisation.
   */
  const charteZwaeg = useCallback(() => {
    if (!startWurf) return;
    track({ name: 'shared_throw_opened' });
    const handle = charteRef.current;
    handle?.zeigOrt(startWurf);
    setWurfNr(n => n + 1);
    wartendOrtRef.current = startWurf;
    setZiel(
      handle?.ortZuPixel(startWurf) ?? mitti(handle?.container() ?? null),
    );
    setLaufend(true);
  }, [startWurf]);

  const gsammlet = gsammleteKantöne(wurfbuech);

  return (
    // `strict` makes the full `motion` component throw, so the split cannot
    // silently regress: Pfyl and Resultatcharte, the only animated descendants,
    // both import `m` from motion/react-m. domAnimation, not domMax — neither
    // pans, drags, nor layout-animates.
    <LazyMotion features={domAnimation} strict>
      {/* gsw is the ISO code for Swiss German — the whole interface is
          Berndeutsch. <html lang> cannot vary per route under one root layout,
          so the override lives here. */}
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

        <Chopf />

        <PaneeKnopf offe={paneeOffe} onWächsle={setPaneeOffe} />

        {paneeOffe && (
          <Panee
            yschtellige={yschtellige}
            wurfbuech={wurfbuech}
            gsammlet={gsammlet}
            onÄndere={ändere}
            onLeere={leereWurfbuech}
            onZeig={eintrag => {
              charteRef.current?.zeigOrt({
                lat: eintrag.wurf.lat,
                lon: eintrag.wurf.lon,
              });
              setPaneeOffe(false);
            }}
          />
        )}

        <Underleischte
          yschtellige={yschtellige}
          resultat={resultat}
          teiletext={teiletext}
          fähler={fähler}
          laufend={laufend}
          charteRect={() =>
            charteRef.current?.container()?.getBoundingClientRect() ?? null
          }
          onWurf={wurf}
          onZug={setZug}
          onNomau={() => {
            setResultat(null);
            setZiel(null);
            wartendOrtRef.current = null;
          }}
          onTeile={teile}
          onZeig={() => {
            if (resultat?.wurf.art !== 'preich') return;
            charteRef.current?.zeigOrt({
              lat: resultat.wurf.lat,
              lon: resultat.wurf.lon,
            });
          }}
        />
      </main>
    </LazyMotion>
  );
}
