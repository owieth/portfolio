'use client';

import { useEffect, useMemo, useRef } from 'react';
// maplibre-gl v6 has no default export — named imports only.
import {
  Map as MlMap,
  type StyleSpecification,
  type TransformStyleFunction,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import type {
  Feature,
  FeatureCollection,
  MultiLineString,
  Point,
} from 'geojson';

import { greatCirclePath } from '@/lib/stats/flights/geo';
import { airportVisits, rankRoutes } from '@/lib/stats/flights/stats';
import type { FlightLeg } from '@/lib/stats/flights/types';
import { prefersReducedMotion } from '@/lib/wo-haere/motion';

/**
 * The flight paths on a globe: one great-circle arc per route, one dot per
 * airport, the whole thing turning slowly until someone grabs it.
 *
 * `prefersReducedMotion` is imported across the wo häre? boundary rather than
 * moved — `CookieNotice` already reaches for `cn` the same way, and promoting
 * either into a shared `src/lib/` is its own change.
 */

/**
 * Same host as the `liberty` style wo häre? uses, so the Report-Only CSP in
 * `next.config.js` needs no new `connect-src` entry.
 */
const STYLE_URL = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
} as const;

const FLIGHTS_SOURCE_ID = 'flights';
const AIRPORTS_SOURCE_ID = 'airports';
const PATHS_LAYER_ID = 'flight-paths';
const DOTS_LAYER_ID = 'airport-dots';

/** The green already on the home page. One accent, no second colour. */
const ACCENT = '#71BC92';

/**
 * Degrees of longitude per second. Driven off the frame delta rather than a
 * fixed per-frame step, so the globe turns at the same speed on a 120 Hz
 * display as on a 60 Hz one.
 */
const SPIN_DEG_PER_SEC = 3;

/** Build the map slightly before it scrolls into view, not as it lands. */
const PREBUILD_MARGIN = '200px';

type MapLayer = StyleSpecification['layers'][number];
type MapSource = StyleSpecification['sources'][string];

interface Scene {
  sources: Record<string, MapSource>;
  layers: MapLayer[];
}

/**
 * Both sources and both layers, derived once from the legs.
 *
 * The arcs are sampled by `greatCirclePath` rather than left to the renderer,
 * which interpolates a two-point line in projected space and would draw the
 * transatlantic routes as visibly wrong rhumb lines.
 */
function buildScene(legs: FlightLeg[]): Scene {
  const routes = rankRoutes(legs);
  const visits = airportVisits(legs);

  const paths: Feature<MultiLineString, { flights: number }>[] = routes.map(
    route => ({
      type: 'Feature',
      id: route.key,
      geometry: greatCirclePath(route.a, route.b),
      properties: { flights: route.flights },
    }),
  );

  const dots: Feature<Point, { visits: number }>[] = visits.map(
    ({ airport, visits: count }) => ({
      type: 'Feature',
      id: airport.iata,
      geometry: { type: 'Point', coordinates: [airport.lon, airport.lat] },
      properties: { visits: count },
    }),
  );

  // `interpolate` throws on stops that do not ascend, which is exactly what a
  // log where every route was flown once would produce. The floor of 2 keeps
  // the expression valid; nothing in the data can then reach the upper stop,
  // so every line comes out at the thin end, which is the honest answer.
  const maxFlights = Math.max(2, ...routes.map(route => route.flights));
  const maxVisits = Math.max(2, ...visits.map(visit => visit.visits));

  return {
    sources: {
      [FLIGHTS_SOURCE_ID]: {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: paths,
        } as FeatureCollection,
      },
      [AIRPORTS_SOURCE_ID]: {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: dots,
        } as FeatureCollection,
      },
    },
    layers: [
      {
        id: PATHS_LAYER_ID,
        type: 'line',
        source: FLIGHTS_SOURCE_ID,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ACCENT,
          'line-opacity': 0.85,
          // Thickness reads flight count, so the London runs look like the
          // lines they are.
          'line-width': [
            'interpolate',
            ['linear'],
            ['get', 'flights'],
            1,
            1.2,
            maxFlights,
            3.5,
          ],
        },
      },
      {
        id: DOTS_LAYER_ID,
        type: 'circle',
        source: AIRPORTS_SOURCE_ID,
        paint: {
          'circle-color': ACCENT,
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['get', 'visits'],
            1,
            2.5,
            maxVisits,
            6,
          ],
          // The halo is the same accent at low opacity rather than a second
          // colour, so it works on both styles.
          'circle-stroke-color': ACCENT,
          'circle-stroke-opacity': 0.25,
          'circle-stroke-width': 3,
        },
      },
    ],
  };
}

export default function FlightGlobe({ legs }: { legs: FlightLeg[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scene = useMemo(() => buildScene(legs), [legs]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let map: MlMap | null = null;
    let frame: number | null = null;
    let previousFrameTime = 0;
    // A reader who has asked for less motion never gets the spin at all.
    let spins = !prefersReducedMotion();

    // Read here and never during render: dark mode is pure `@media`, so there
    // is no class or cookie the server could match and a branch in JSX would
    // hydrate wrong.
    const dark = window.matchMedia('(prefers-color-scheme: dark)');
    const styleUrl = () => STYLE_URL[dark.matches ? 'dark' : 'light'];

    const stopSpin = () => {
      if (frame === null) return;
      cancelAnimationFrame(frame);
      frame = null;
    };

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const elapsed = previousFrameTime ? now - previousFrameTime : 0;
      previousFrameTime = now;
      // Never fight a camera the user or an ease is already moving.
      if (!map || map.isMoving()) return;

      const center = map.getCenter();
      center.lng += (SPIN_DEG_PER_SEC * elapsed) / 1000;
      map.setCenter(center);
    };

    const startSpin = () => {
      if (!spins || !map || frame !== null) return;
      // Cleared so the first frame after a pause contributes no jump.
      previousFrameTime = 0;
      frame = requestAnimationFrame(tick);
    };

    /**
     * The first grab stops the spin for good.
     *
     * Deliberately not on `wheel`: that fires on plain trackpad page-scroll
     * even with `scrollZoom` off, so a reader scrolling past would freeze the
     * globe for no visible reason.
     */
    const engage = () => {
      spins = false;
      stopSpin();
    };

    /**
     * `setProjection`, `addSource` and `addLayer` all throw "Style is not done
     * loading" before the style is ready, so they live here rather than beside
     * the constructor — and `isStyleLoaded()` is not a reliable gate, see the
     * docblock on `Wandcharte.syncStyle`.
     *
     * Every call is guarded, because `transformStyle` carries the sources and
     * layers across a theme swap and `style.load` fires again afterwards.
     */
    const onStyleLoad = () => {
      if (!map) return;
      if (map.getProjection()?.type !== 'globe') {
        map.setProjection({ type: 'globe' });
      }
      for (const [id, source] of Object.entries(scene.sources)) {
        if (!map.getSource(id)) map.addSource(id, source);
      }
      for (const layer of scene.layers) {
        if (!map.getLayer(layer.id)) map.addLayer(layer);
      }
    };

    const build = () => {
      map = new MlMap({
        container,
        style: styleUrl(),
        // `MapOptions` has no `projection`, so one mercator frame before
        // `style.load` is unavoidable. This framing makes it unremarkable, and
        // puts the Atlantic — where most of the arcs are — front and centre.
        center: [-20, 40],
        zoom: 1.5,
        // Not `cooperativeGestures`: it sets `touch-action: pan-x pan-y` and
        // gates `touchmove` on two touches, so a one-finger drag on a phone
        // would scroll the page instead of spinning the globe. Suppressing
        // scroll zoom alone leaves page scroll untouched and needs no overlay.
        scrollZoom: false,
        attributionControl: { compact: true },
      });

      map.on('style.load', onStyleLoad);
      map.on('mousedown', engage);
      map.on('touchstart', engage);
    };

    /**
     * A bare `setStyle` takes the diff path, which removes every source and
     * layer the incoming style does not declare — both of ours — and, because
     * neither OpenFreeMap style carries a `projection`, applies an eager
     * `setProjection(undefined)` that flattens the globe to mercator.
     * `transformStyle` runs before the diff, so nothing is ever removed.
     *
     * The default `diff: true` stays: the two styles share their sprite and
     * glyphs, so the swap is layer-only, and the diff explicitly skips the
     * camera.
     */
    const transformStyle: TransformStyleFunction = (_previous, next) => ({
      ...next,
      projection: { type: 'globe' },
      sources: { ...next.sources, ...scene.sources },
      layers: [...next.layers, ...scene.layers],
    });

    const onThemeChange = () => {
      map?.setStyle(styleUrl(), { transformStyle });
    };
    dark.addEventListener('change', onThemeChange);

    // Two jobs: never open a WebGL context or request a tile for a reader who
    // scrolls past, and pause the spin while it is off-screen. Once built the
    // map stays built.
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) {
            stopSpin();
            continue;
          }
          if (!map) build();
          startSpin();
        }
      },
      { rootMargin: PREBUILD_MARGIN },
    );
    observer.observe(container);

    return () => {
      observer.disconnect();
      dark.removeEventListener('change', onThemeChange);
      stopSpin();
      map?.remove();
      map = null;
    };
  }, [scene]);

  return (
    // Sized rather than `absolute inset-0`: maplibre's stylesheet forces
    // `position: relative` on .maplibregl-map, and both are single-class
    // selectors, so `absolute` loses on source order and the box collapses.
    //
    // `isolate` gives the wrapper a stacking context, so nothing maplibre
    // draws competes with the fixed header. `border-foreground/20` rather than
    // `border-line`, which is half-white in dark mode and would read as a
    // highlight around a dark map.
    //
    // The variant undoes the safe-area margin in globals.css, which was written
    // for the fullscreen wo häre? map and pushes the attribution off the edge
    // of an inline box on iOS.
    <div className="border-foreground/20 relative isolate mt-8 h-[60dvh] min-h-80 w-full overflow-hidden rounded-lg border [&_.maplibregl-ctrl-bottom-right]:mb-0">
      <div ref={containerRef} className="size-full" />
    </div>
  );
}
