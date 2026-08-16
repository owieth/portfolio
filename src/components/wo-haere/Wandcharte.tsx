'use client';

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type RefObject,
} from 'react';
// maplibre-gl v6 has no default export — named imports only.
import { Map as MlMap, Marker, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { CH_BOUNDS, type LatLon } from '@/lib/wo-haere/geo/ch';
import {
  CHARTE_STYLE,
  SWISSTOPO_LAYER_ID,
  SWISSTOPO_SOURCE,
  SWISSTOPO_SOURCE_ID,
  WAEUT_STYLE,
} from '@/lib/wo-haere/maplibre/styles';
import type { Aasicht, WurfEintrag } from '@/lib/wo-haere/types';
import { prefersReducedMotion } from '@/lib/wo-haere/motion';

const CH_FIT: [[number, number], [number, number]] = [
  [CH_BOUNDS.west, CH_BOUNDS.south],
  [CH_BOUNDS.east, CH_BOUNDS.north],
];

/**
 * The camera is kept near Switzerland, but with slack around it. `maxBounds`
 * forces a minimum zoom at which the viewport fits *inside* the bounds, and
 * because Switzerland is far wider than tall that stops a portrait phone from
 * ever showing the whole country. The padding buys back that room.
 */
const CH_ROOM: [[number, number], [number, number]] = [
  [CH_BOUNDS.west - 3.5, CH_BOUNDS.south - 3.5],
  [CH_BOUNDS.east + 3.5, CH_BOUNDS.north + 3.5],
];

export interface WandcharteHandle {
  /**
   * Screen pixel to coordinate. Returns null when the pixel is not on the
   * globe at all — on a sphere the far side of the planet also unprojects to
   * a coordinate, so the result is round-tripped and rejected if it does not
   * land back on the same pixel.
   */
  pixelZuOrt(x: number, y: number): LatLon | null;
  ortZuPixel(ort: LatLon): { x: number; y: number } | null;
  zeigOrt(ort: LatLon): void;
  container(): HTMLDivElement | null;
}

interface WandcharteProps {
  aasicht: Aasicht;
  wuerf: WurfEintrag[];
  ref: RefObject<WandcharteHandle | null>;
  /** Fires once the map can project coordinates. */
  onZwaeg?: () => void;
}

type StyleMode = 'papier' | 'wäut';

/** Per-map-instance state, so a replaced map never inherits stale readiness. */
interface MapCtx {
  map: MlMap;
  styleZwaeg: boolean;
}

function styleFor(aasicht: Aasicht): string | StyleSpecification {
  return aasicht === 'charte' ? CHARTE_STYLE : WAEUT_STYLE;
}

export default function Wandcharte({
  aasicht,
  wuerf,
  ref,
  onZwaeg,
}: WandcharteProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markerRef = useRef<Marker[]>([]);
  const rotationRef = useRef<number | null>(null);
  const styleModeRef = useRef<StyleMode>(
    aasicht === 'charte' ? 'papier' : 'wäut',
  );
  // Read inside map callbacks, which outlive any single render.
  const aasichtRef = useRef<Aasicht>(aasicht);
  const ctxRef = useRef<MapCtx | null>(null);
  // Held in a ref so the map is never rebuilt just because the callback changed.
  const onZwaegRef = useRef(onZwaeg);
  useEffect(() => {
    onZwaegRef.current = onZwaeg;
  }, [onZwaeg]);

  const stopRotation = useCallback(() => {
    if (rotationRef.current !== null) {
      cancelAnimationFrame(rotationRef.current);
      rotationRef.current = null;
    }
  }, []);

  /** Slow idle spin on the globe, paused as soon as the user grabs it. */
  const startRotation = useCallback(
    (map: MlMap) => {
      stopRotation();
      if (prefersReducedMotion()) return;
      const tick = () => {
        if (!map.isMoving()) {
          const center = map.getCenter();
          center.lng += 0.02;
          map.setCenter(center);
        }
        rotationRef.current = requestAnimationFrame(tick);
      };
      rotationRef.current = requestAnimationFrame(tick);
    },
    [stopRotation],
  );

  useImperativeHandle(ref, () => ({
    pixelZuOrt(x, y) {
      const map = mapRef.current;
      if (!map) return null;

      const lngLat = map.unproject([x, y]);
      if (!Number.isFinite(lngLat.lat) || !Number.isFinite(lngLat.lng))
        return null;
      if (Math.abs(lngLat.lat) > 90) return null;

      // Round-trip guard: on the globe, pixels beyond the horizon still
      // unproject, but they do not project back to where they came from.
      const back = map.project(lngLat);
      if (Math.hypot(back.x - x, back.y - y) > 2) return null;

      return { lat: lngLat.lat, lon: lngLat.lng };
    },
    ortZuPixel(ort) {
      const map = mapRef.current;
      if (!map) return null;
      const p = map.project([ort.lon, ort.lat]);
      return Number.isFinite(p.x) && Number.isFinite(p.y)
        ? { x: p.x, y: p.y }
        : null;
    },
    zeigOrt(ort) {
      const map = mapRef.current;
      if (!map) return;
      stopRotation();
      const target = {
        center: [ort.lon, ort.lat] as [number, number],
        zoom: 11,
      };
      if (prefersReducedMotion()) map.jumpTo(target);
      else map.flyTo({ ...target, duration: 1800 });
    },
    container: () => containerRef.current,
  }));

  /**
   * Brings the style in line with the selected view mode.
   *
   * `setProjection`, `addSource` and `addLayer` all throw "Style is not done
   * loading" before the style is ready, so this only runs once the map has
   * reported `style.load`. Readiness is tracked per map instance rather than
   * with `isStyleLoaded()`, which never returns true for the world style even
   * after it has fully rendered.
   */
  const syncStyle = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx || !ctx.styleZwaeg) return;
    const { map } = ctx;

    const chugele = aasichtRef.current !== 'charte';
    const wanted = chugele ? 'globe' : 'mercator';
    if (map.getProjection()?.type !== wanted) {
      map.setProjection({ type: wanted });
    }
    if (!chugele) return;

    // The globe modes share the world style, with swisstopo layered on top so
    // that zooming into Switzerland lands on the Landeskarte. `minzoom` does
    // the reveal: below it a single swisstopo tile spans far more than
    // Switzerland and its blank margins smear a white blob over the globe.
    if (!map.getSource(SWISSTOPO_SOURCE_ID)) {
      map.addSource(SWISSTOPO_SOURCE_ID, SWISSTOPO_SOURCE);
    }
    if (!map.getLayer(SWISSTOPO_LAYER_ID)) {
      map.addLayer({
        id: SWISSTOPO_LAYER_ID,
        type: 'raster',
        source: SWISSTOPO_SOURCE_ID,
        minzoom: 6,
      });
    }
  }, []);

  // One map instance for the component's lifetime; the view mode only swaps
  // the style and projection, which keeps the dart holes and camera alive.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const map = new MlMap({
      container,
      style: styleFor(aasichtRef.current),
      center: [8.2, 46.8],
      zoom: aasichtRef.current === 'charte' ? 7 : 2.2,
      attributionControl: { compact: true },
      dragRotate: false,
      maxBounds: aasichtRef.current === 'charte' ? CH_ROOM : undefined,
    });
    mapRef.current = map;
    const ctx: MapCtx = { map, styleZwaeg: false };
    ctxRef.current = ctx;

    const onStyleLoad = () => {
      ctx.styleZwaeg = true;
      syncStyle();
    };
    map.on('style.load', onStyleLoad);
    map.on('mousedown', stopRotation);
    map.on('touchstart', stopRotation);
    map.on('wheel', stopRotation);
    map.once('load', () => onZwaegRef.current?.());

    return () => {
      stopRotation();
      for (const m of markerRef.current) m.remove();
      markerRef.current = [];
      map.remove();
      mapRef.current = null;
      if (ctxRef.current === ctx) ctxRef.current = null;
    };
    // The map is created once; the view mode is read from a ref.
  }, [stopRotation, syncStyle]);

  // Move the camera when the view mode changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    aasichtRef.current = aasicht;
    stopRotation();

    const styleMode: StyleMode = aasicht === 'charte' ? 'papier' : 'wäut';
    if (styleModeRef.current !== styleMode) {
      styleModeRef.current = styleMode;
      // A swap invalidates readiness; `style.load` re-runs the sync.
      if (ctxRef.current) ctxRef.current.styleZwaeg = false;
      map.setStyle(styleFor(aasicht));
    }
    syncStyle();

    const reduced = prefersReducedMotion();

    if (aasicht === 'charte') {
      map.setMaxBounds(CH_ROOM);
      map.fitBounds(CH_FIT, { padding: 24, duration: reduced ? 0 : 900 });
      return;
    }

    map.setMaxBounds(null);

    if (aasicht === 'chugele') {
      map.easeTo({
        center: [8.2, 46.8],
        zoom: 2.2,
        duration: reduced ? 0 : 900,
      });
      startRotation(map);
      return;
    }

    // Aaflug: hang on the globe for a moment, then dive into Switzerland.
    // Crossing the raster layer's minzoom reveals the Landeskarte on the way.
    // End on Charte's framing (derived from CH_FIT, so it tracks the viewport
    // aspect ratio) rather than a fixed zoom — a fixed zoom settles wide enough
    // that the swisstopo coverage edge creeps into frame as a cream band.
    const ziu = map.cameraForBounds(CH_FIT, { padding: 24 });
    const center = ziu?.center ?? ([8.2, 46.8] as [number, number]);
    const zoom = ziu?.zoom ?? 7.2;
    if (reduced) {
      map.jumpTo({ center, zoom });
      return;
    }
    map.jumpTo({ center: [8.2, 46.8], zoom: 1.8 });
    map.flyTo({
      center,
      zoom,
      duration: 4200,
      essential: true,
    });
  }, [aasicht, startRotation, stopRotation, syncStyle]);

  // Past throws stay pinned to the map as little dart holes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const m of markerRef.current) m.remove();
    markerRef.current = wuerf.map(eintrag => {
      const el = document.createElement('div');
      el.className = 'pfyl-loch';
      el.setAttribute('aria-hidden', 'true');
      el.title = eintrag.ziuName ?? '';
      return new Marker({ element: el })
        .setLngLat([eintrag.wurf.lon, eintrag.wurf.lat])
        .addTo(map);
    });
  }, [wuerf]);

  // Sized explicitly rather than with `absolute inset-0`: maplibre's own
  // stylesheet forces `position: relative` on .maplibregl-map, which would
  // override the utility class and collapse the container to zero height.
  return <div ref={containerRef} className="size-full" />;
}
