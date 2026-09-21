'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
// maplibre-gl v6 has no default export — named imports only.
import {
  Map as MlMap,
  type MapGeoJSONFeature,
  type Point as Point2D,
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

import { ensureMaplibreWorker } from '@/lib/maplibre/worker';
import { globeStyle } from '@/lib/stats/maplibre/styles';
import { formatDistanceKm } from '@/lib/stats/flights/format';
import { greatCirclePath } from '@/lib/stats/flights/geo';
import { airportVisits, rankRoutes } from '@/lib/stats/flights/stats';
import type { FlightLeg } from '@/lib/stats/flights/types';
import { prefersReducedMotion } from '@/lib/wo-haere/motion';

/**
 * The flight paths on a globe: one great-circle arc per route, one dot per
 * airport, the whole thing turning slowly until someone grabs it. Tapping a
 * route or an airport dims everything it does not touch and names it below.
 *
 * `prefersReducedMotion` is imported across the wo häre? boundary rather than
 * moved — `CookieNotice` already reaches for `cn` the same way, and promoting
 * either into a shared `src/lib/` is its own change.
 */

const FLIGHTS_SOURCE_ID = 'flights';
const AIRPORTS_SOURCE_ID = 'airports';
const PATHS_LAYER_ID = 'flight-paths';
const DOTS_LAYER_ID = 'airport-dots';
/**
 * Invisible, and the only things a tap is ever tested against. The drawn line
 * is 1.2px at its thinnest and the drawn dot barely wider, which is a target
 * nobody can hit on a phone — so the pointer gets its own geometry, sized for
 * a fingertip rather than for the eye.
 */
const PATHS_HIT_LAYER_ID = 'flight-paths-hit';
const DOTS_HIT_LAYER_ID = 'airport-dots-hit';

/** Roughly half a fingertip, which is what the WCAG 24px target works out to. */
const HIT_RADIUS = 12;

/** The green already on the home page. One accent, no second colour. */
const ACCENT = '#71BC92';

/** What the unselected half fades to. Present, but plainly not the subject. */
const DIMMED = 0.12;

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
type LineLayer = Extract<MapLayer, { type: 'line' }>;
type LineWidth = NonNullable<NonNullable<LineLayer['paint']>['line-width']>;

/**
 * A style expression. MapLibre re-exports neither `ExpressionSpecification`
 * nor `FilterSpecification`, so it is read back off the one place the shipped
 * types spell it out: the predicate slot of a `case`.
 */
type Expression = Extract<
  Extract<LineWidth, readonly ['case', ...unknown[]]>[1],
  object
>;

/** Flat on purpose: feature properties have to survive the trip to the worker. */
interface RouteProperties {
  key: string;
  flights: number;
  distanceKm: number;
  from: string;
  to: string;
  fromIata: string;
  toIata: string;
}

interface AirportProperties {
  iata: string;
  city: string;
  visits: number;
}

/** What the reader last tapped, and enough of it to both paint and name. */
type Selection =
  | { kind: 'route'; key: string; iatas: [string, string]; label: string }
  | { kind: 'airport'; iata: string; label: string };

interface Scene {
  sources: Record<string, MapSource>;
  layers: MapLayer[];
  /** Kept so the selection paint can thicken the base rather than replace it. */
  lineWidth: Expression;
  circleRadius: Expression;
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

  const paths: Feature<MultiLineString, RouteProperties>[] = routes.map(
    route => ({
      type: 'Feature',
      geometry: greatCirclePath(route.a, route.b),
      properties: {
        key: route.key,
        flights: route.flights,
        distanceKm: route.distanceKm,
        from: route.a.city,
        to: route.b.city,
        fromIata: route.a.iata,
        toIata: route.b.iata,
      },
    }),
  );

  const dots: Feature<Point, AirportProperties>[] = visits.map(
    ({ airport, visits: count }) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [airport.lon, airport.lat] },
      properties: { iata: airport.iata, city: airport.city, visits: count },
    }),
  );

  // `interpolate` throws on stops that do not ascend, which is exactly what a
  // log where every route was flown once would produce. The floor of 2 keeps
  // the expression valid; nothing in the data can then reach the upper stop,
  // so every line comes out at the thin end, which is the honest answer.
  const maxFlights = Math.max(2, ...routes.map(route => route.flights));
  const maxVisits = Math.max(2, ...visits.map(visit => visit.visits));

  // Thickness reads flight count, so the London runs look like the lines they
  // are; radius reads visits the same way.
  const lineWidth: Expression = [
    'interpolate',
    ['linear'],
    ['get', 'flights'],
    1,
    1.2,
    maxFlights,
    3.5,
  ];
  const circleRadius: Expression = [
    'interpolate',
    ['linear'],
    ['get', 'visits'],
    1,
    2.5,
    maxVisits,
    6,
  ];

  return {
    lineWidth,
    circleRadius,
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
        id: PATHS_HIT_LAYER_ID,
        type: 'line',
        source: FLIGHTS_SOURCE_ID,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-opacity': 0, 'line-width': HIT_RADIUS * 2 },
      },
      {
        id: DOTS_HIT_LAYER_ID,
        type: 'circle',
        source: AIRPORTS_SOURCE_ID,
        paint: { 'circle-opacity': 0, 'circle-radius': HIT_RADIUS },
      },
      {
        id: PATHS_LAYER_ID,
        type: 'line',
        source: FLIGHTS_SOURCE_ID,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ACCENT,
          'line-opacity': 0.85,
          'line-width': lineWidth,
        },
      },
      {
        id: DOTS_LAYER_ID,
        type: 'circle',
        source: AIRPORTS_SOURCE_ID,
        paint: {
          'circle-color': ACCENT,
          'circle-radius': circleRadius,
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

/** True for the routes the selection covers: the one tapped, or all of an
 * airport's. */
const matchesRoute = (selection: Selection): Expression =>
  selection.kind === 'route'
    ? ['==', ['get', 'key'], selection.key]
    : [
        'any',
        ['==', ['get', 'fromIata'], selection.iata],
        ['==', ['get', 'toIata'], selection.iata],
      ];

/** True for the dots at either end of the selection. */
const matchesAirport = (selection: Selection): Expression =>
  selection.kind === 'airport'
    ? ['==', ['get', 'iata'], selection.iata]
    : [
        'any',
        ['==', ['get', 'iata'], selection.iatas[0]],
        ['==', ['get', 'iata'], selection.iatas[1]],
      ];

/**
 * Repaints both layers for the current selection.
 *
 * Nothing is added or removed: the same two layers carry a `case` around the
 * base expressions, so the selected arcs keep the thickness their flight count
 * earned them and merely gain on it. Also runs after a theme swap, where the
 * layers are re-added from `scene` with their unselected paint.
 */
function applySelection(
  map: MlMap,
  selection: Selection | null,
  scene: Scene,
): void {
  if (!map.getLayer(PATHS_LAYER_ID) || !map.getLayer(DOTS_LAYER_ID)) return;

  if (!selection) {
    map.setPaintProperty(PATHS_LAYER_ID, 'line-opacity', 0.85);
    map.setPaintProperty(PATHS_LAYER_ID, 'line-width', scene.lineWidth);
    map.setPaintProperty(DOTS_LAYER_ID, 'circle-opacity', 1);
    map.setPaintProperty(DOTS_LAYER_ID, 'circle-stroke-opacity', 0.25);
    return;
  }

  const route = matchesRoute(selection);
  const airport = matchesAirport(selection);

  map.setPaintProperty(PATHS_LAYER_ID, 'line-opacity', [
    'case',
    route,
    1,
    DIMMED,
  ]);
  map.setPaintProperty(PATHS_LAYER_ID, 'line-width', [
    'case',
    route,
    ['*', scene.lineWidth, 1.8],
    scene.lineWidth,
  ]);
  map.setPaintProperty(DOTS_LAYER_ID, 'circle-opacity', [
    'case',
    airport,
    1,
    DIMMED,
  ]);
  map.setPaintProperty(DOTS_LAYER_ID, 'circle-stroke-opacity', [
    'case',
    airport,
    0.5,
    0,
  ]);
}

/** The tapped point's closest dot, by screen distance to its own centre. */
function nearest(
  map: MlMap,
  point: Point2D,
  features: MapGeoJSONFeature[] | undefined,
): MapGeoJSONFeature | undefined {
  let closest: MapGeoJSONFeature | undefined;
  let best = Infinity;

  for (const feature of features ?? []) {
    if (feature.geometry.type !== 'Point') continue;
    const [lon, lat] = feature.geometry.coordinates;
    const at = map.project([lon, lat]);
    const distance = Math.hypot(at.x - point.x, at.y - point.y);
    if (distance < best) {
      best = distance;
      closest = feature;
    }
  }

  return closest;
}

const plural = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? '' : 's'}`;

const routeSelection = (feature: MapGeoJSONFeature): Selection => {
  const { key, from, to, fromIata, toIata, flights, distanceKm } =
    feature.properties as RouteProperties;

  return {
    kind: 'route',
    key,
    iatas: [fromIata, toIata],
    label: `${from} · ${to} — ${plural(flights, 'flight')}, ${formatDistanceKm(distanceKm)}`,
  };
};

const airportSelection = (feature: MapGeoJSONFeature): Selection => {
  const { iata, city, visits } = feature.properties as AirportProperties;

  return {
    kind: 'airport',
    iata,
    label: `${city} (${iata}) — ${plural(visits, 'visit')}`,
  };
};

/** Tapping the same thing twice clears it, so there is always a way back out. */
const toggle = (
  current: Selection | null,
  next: Selection,
): Selection | null =>
  current &&
  current.kind === next.kind &&
  (current.kind === 'route'
    ? current.key === (next as { key: string }).key
    : current.iata === (next as { iata: string }).iata)
    ? null
    : next;

export default function FlightGlobe({ legs }: { legs: FlightLeg[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const scene = useMemo(() => buildScene(legs), [legs]);
  const [selection, setSelection] = useState<Selection | null>(null);
  // Read inside map handlers, which outlive the render that registered them.
  const selectionRef = useRef<Selection | null>(null);

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
    const styleFor = () => globeStyle(dark.matches ? 'dark' : 'light');

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
     * `addSource` and `addLayer` both throw "Style is not done loading" before
     * the style is ready, so they live here rather than beside the constructor
     * — and `isStyleLoaded()` is not a reliable gate, see the docblock on
     * `Wandcharte.syncStyle`. The projection needs no such call: it is declared
     * in the style itself.
     *
     * Every call is guarded, because `transformStyle` carries the sources and
     * layers across a theme swap and `style.load` fires again afterwards.
     */
    const onStyleLoad = () => {
      if (!map) return;
      for (const [id, source] of Object.entries(scene.sources)) {
        if (!map.getSource(id)) map.addSource(id, source);
      }
      for (const layer of scene.layers) {
        if (!map.getLayer(layer.id)) map.addLayer(layer);
      }
      // A swap re-adds the layers with their unselected paint.
      applySelection(map, selectionRef.current, scene);
    };

    const pointer = (over: boolean) => () => {
      if (map) map.getCanvas().style.cursor = over ? 'pointer' : '';
    };

    const build = () => {
      ensureMaplibreWorker();
      map = new MlMap({
        container,
        style: styleFor(),
        // The Atlantic, where most of the arcs are, front and centre.
        center: [-20, 40],
        zoom: 1.5,
        // Not `cooperativeGestures`: it sets `touch-action: pan-x pan-y` and
        // gates `touchmove` on two touches, so a one-finger drag on a phone
        // would scroll the page instead of spinning the globe. Suppressing
        // scroll zoom alone leaves page scroll untouched and needs no overlay.
        scrollZoom: false,
        attributionControl: { compact: true },
      });
      mapRef.current = map;

      map.on('style.load', onStyleLoad);
      map.on('mousedown', engage);
      map.on('touchstart', engage);

      map.on('click', DOTS_HIT_LAYER_ID, event => {
        // The hit circles are wider than the dots and the European airports
        // sit on top of each other at this zoom, so a tap routinely catches
        // several. The nearest one is the one that was meant.
        const feature = nearest(map!, event.point, event.features);
        if (!feature) return;
        setSelection(current => toggle(current, airportSelection(feature)));
      });

      map.on('click', PATHS_HIT_LAYER_ID, event => {
        const feature = event.features?.[0];
        // Dots sit on top and are the smaller target, so a tap that catches
        // both belongs to the dot and its own handler has already taken it.
        if (!feature || !map) return;
        if (
          map.queryRenderedFeatures(event.point, {
            layers: [DOTS_HIT_LAYER_ID],
          }).length
        ) {
          return;
        }
        setSelection(current => toggle(current, routeSelection(feature)));
      });

      // Anywhere else on the globe drops the selection. Layer handlers fire
      // for the same click, so this asks what is actually under the pointer
      // rather than assuming.
      map.on('click', event => {
        if (!map) return;
        const hits = map.queryRenderedFeatures(event.point, {
          layers: [PATHS_HIT_LAYER_ID, DOTS_HIT_LAYER_ID],
        });
        if (hits.length === 0) setSelection(null);
      });

      for (const layer of [PATHS_HIT_LAYER_ID, DOTS_HIT_LAYER_ID]) {
        map.on('mouseenter', layer, pointer(true));
        map.on('mouseleave', layer, pointer(false));
      }
    };

    /**
     * A bare `setStyle` takes the diff path, which removes every source and
     * layer the incoming style does not declare — both of ours.
     * `transformStyle` runs before the diff instead, so nothing is removed and
     * the paths never blink.
     *
     * The default `diff: true` stays: the two schemes differ only in their
     * paint, so the swap costs three `setPaintProperty` calls and no tile is
     * refetched.
     */
    const transformStyle: TransformStyleFunction = (_previous, next) => ({
      ...next,
      sources: { ...next.sources, ...scene.sources },
      layers: [...next.layers, ...scene.layers],
    });

    const onThemeChange = () => {
      map?.setStyle(styleFor(), { transformStyle });
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
      mapRef.current = null;
    };
  }, [scene]);

  useEffect(() => {
    selectionRef.current = selection;
    const map = mapRef.current;
    if (map) applySelection(map, selection, scene);
  }, [selection, scene]);

  return (
    <div className="mt-8">
      {/*
        Sized rather than `absolute inset-0`: maplibre's stylesheet forces
        `position: relative` on .maplibregl-map, and both are single-class
        selectors, so `absolute` loses on source order and the box collapses.

        `isolate` gives the wrapper a stacking context, so nothing maplibre
        draws competes with the fixed header. `border-foreground/20` rather
        than `border-line`, which is half-white in dark mode and would read as
        a highlight around a dark map.

        The variant undoes the safe-area margin in globals.css, which was
        written for the fullscreen wo häre? map and pushes the attribution off
        the edge of an inline box on iOS.
      */}
      <div className="border-foreground/20 relative isolate h-[60dvh] min-h-80 w-full overflow-hidden rounded-lg border [&_.maplibregl-ctrl-bottom-right]:mb-0">
        <div ref={containerRef} className="size-full" />
      </div>
      {/*
        The caption is the only readout of what is selected, so it is polite
        rather than silent. Both branches are one line, which keeps the tap
        from shifting the sections below.
      */}
      <p
        aria-live="polite"
        className="text-muted mt-3 truncate text-sm tabular-nums"
      >
        {selection?.label ?? 'Tap a route or an airport to follow it.'}
      </p>
    </div>
  );
}
