'use client';

import { Combobox } from '@base-ui/react/combobox';
import { useEffect, useMemo, useRef, useState } from 'react';
// maplibre-gl v6 has no default export — named imports only.
import {
  Map as MlMap,
  type LngLatBoundsLike,
  type StyleSpecification,
  type TransformStyleFunction,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import type { Feature, FeatureCollection, Point } from 'geojson';

import { CH_BOUNDS } from '@/lib/geo/ch';
import { ensureMaplibreWorker } from '@/lib/maplibre/worker';
import { flatStyle } from '@/lib/stats/maplibre/styles';
import { mapLines, type RailMapLine } from '@/lib/stats/rail/map';
import type { RailStretch } from '@/lib/stats/rail/stretch';
import type { RailLineProgress, RailStation } from '@/lib/stats/rail/types';
import { prefersReducedMotion } from '@/lib/wo-haere/motion';

/**
 * The Swiss rail network on a flat map: every line with geometry in a muted
 * grey, what was ridden in the accent, one dot per station gone through. The
 * same family as `FlightGlobe` — no labels, one accent, and a tap names the
 * line below the map. The same line can be found by name in the combobox under
 * it, which is the way in for anyone without a pointer.
 *
 * The geometry is fetched by MapLibre from `public/rail/lines.geojson` rather
 * than passed as a prop, so a megabyte of coordinates stays out of the page's
 * RSC payload and out of the JS bundle.
 *
 * What was ridden comes two ways. A line ridden end to end is its own feature
 * in that file, picked out by id. A stretch between two stops was cut out of
 * the same file on the server by `rideStretches`, and arrives as a prop: only
 * the track ridden, which is a few points per ride.
 */

const LINES_SOURCE_ID = 'rail-lines';
const STATIONS_SOURCE_ID = 'rail-stations';
const STRETCHES_SOURCE_ID = 'rail-stretches';
const LINES_HIT_LAYER_ID = 'rail-lines-hit';
const LINES_LAYER_ID = 'rail-lines';
const RIDDEN_LAYER_ID = 'rail-ridden';
const STRETCHES_LAYER_ID = 'rail-stretched';
const SELECTED_LAYER_ID = 'rail-selected';
const STATIONS_LAYER_ID = 'rail-stations';

const LINES_URL = '/rail/lines.geojson';

/** What `lines.geojson` carries in its own `attribution`; ODbL wants it shown. */
const LINES_ATTRIBUTION = '© OpenStreetMap contributors';

/** Roughly half a fingertip, as on the globe. */
const HIT_RADIUS = 12;

/** The green already on the home page and the globe. One accent. */
const ACCENT = '#71BC92';

/**
 * What the rest of the network fades to while one line is picked out. Higher
 * than the globe's, since here the grey is the map rather than the backdrop.
 */
const DIMMED = 0.3;

/** The stations' halo: the accent at low opacity rather than a second colour. */
const HALO = 0.25;

/**
 * Darker than the country outline in light mode and lighter than it in dark,
 * so the network reads as the subject and the border as the frame.
 */
const MUTED: Record<Scheme, string> = {
  light: 'hsl(0, 0%, 62%)',
  dark: 'hsl(0, 0%, 36%)',
};

const CH_FIT: [[number, number], [number, number]] = [
  [CH_BOUNDS.west, CH_BOUNDS.south],
  [CH_BOUNDS.east, CH_BOUNDS.north],
];

/**
 * Slack around the country, for the reason Wandcharte gives for `CH_ROOM`:
 * `maxBounds` forces the viewport inside it, and a tight box would stop a
 * portrait phone from ever seeing the whole of Switzerland.
 */
const CH_ROOM: LngLatBoundsLike = [
  [CH_BOUNDS.west - 2, CH_BOUNDS.south - 2],
  [CH_BOUNDS.east + 2, CH_BOUNDS.north + 2],
];

const PREBUILD_MARGIN = '200px';

type Scheme = 'light' | 'dark';
type MapLayer = StyleSpecification['layers'][number];
type MapSource = StyleSpecification['sources'][string];
type LineLayer = Extract<MapLayer, { type: 'line' }>;
type LineWidth = NonNullable<NonNullable<LineLayer['paint']>['line-width']>;

/** Read back off a `case` predicate, for the reason FlightGlobe gives. */
type Expression = Extract<
  Extract<LineWidth, readonly ['case', ...unknown[]]>[1],
  object
>;

/** Thin enough at the whole-country zoom that parallel lines stay apart. */
const width = (at7: number, at12: number) =>
  ['interpolate', ['linear'], ['zoom'], 7, at7, 12, at12] as Expression;

/** The empty string matches no feature, so nothing selected draws nothing. */
const selectedFilter = (id: string | null) =>
  ['==', ['get', 'id'], id ?? ''] as Expression;

const opacityFor = (selectedId: string | null) =>
  selectedId === null ? 1 : DIMMED;

function sourcesFor(
  stations: RailStation[],
  stretches: RailStretch[],
): Record<string, MapSource> {
  const dots: Feature<Point>[] = stations.flatMap(({ didok, lat, lon }) =>
    lat === null || lon === null
      ? []
      : [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [lon, lat] },
            properties: { didok },
          },
        ],
  );

  return {
    [LINES_SOURCE_ID]: {
      type: 'geojson',
      data: LINES_URL,
      attribution: LINES_ATTRIBUTION,
    },
    [STATIONS_SOURCE_ID]: {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: dots } as FeatureCollection,
    },
    [STRETCHES_SOURCE_ID]: {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: stretches },
    },
  };
}

/**
 * Per scheme, so a theme swap diffs down to a paint change on the muted
 * layer. The selection goes in too, so the same diff leaves it alone and a
 * line picked before the style loaded is drawn picked.
 */
function layersFor(
  scheme: Scheme,
  wholeIds: string[],
  selectedId: string | null,
): MapLayer[] {
  const opacity = opacityFor(selectedId);

  return [
    {
      id: LINES_HIT_LAYER_ID,
      type: 'line',
      source: LINES_SOURCE_ID,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-opacity': 0, 'line-width': HIT_RADIUS * 2 },
    },
    {
      id: LINES_LAYER_ID,
      type: 'line',
      source: LINES_SOURCE_ID,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': MUTED[scheme],
        'line-opacity': opacity,
        'line-width': width(1, 2.5),
      },
    },
    {
      id: RIDDEN_LAYER_ID,
      type: 'line',
      source: LINES_SOURCE_ID,
      filter: ['in', ['get', 'id'], ['literal', wholeIds]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ACCENT,
        'line-opacity': opacity,
        'line-width': width(2, 4),
      },
    },
    {
      id: STRETCHES_LAYER_ID,
      type: 'line',
      source: STRETCHES_SOURCE_ID,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ACCENT,
        'line-opacity': opacity,
        'line-width': width(2, 4),
      },
    },
    {
      id: SELECTED_LAYER_ID,
      type: 'line',
      source: LINES_SOURCE_ID,
      filter: selectedFilter(selectedId),
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ACCENT, 'line-width': width(4, 7) },
    },
    {
      id: STATIONS_LAYER_ID,
      type: 'circle',
      source: STATIONS_SOURCE_ID,
      paint: {
        'circle-color': ACCENT,
        'circle-opacity': opacity,
        'circle-radius': width(2.5, 4),
        'circle-stroke-color': ACCENT,
        'circle-stroke-opacity': HALO * opacity,
        'circle-stroke-width': 3,
      },
    },
  ];
}

/**
 * Picks the selected line out and fades the rest, as the globe does. The same
 * paint `layersFor` declares, so a theme swap and a selection never disagree.
 */
function applySelection(map: MlMap, selectedId: string | null): void {
  if (!map.getLayer(SELECTED_LAYER_ID)) return;

  const opacity = opacityFor(selectedId);

  map.setFilter(SELECTED_LAYER_ID, selectedFilter(selectedId));
  map.setPaintProperty(LINES_LAYER_ID, 'line-opacity', opacity);
  map.setPaintProperty(RIDDEN_LAYER_ID, 'line-opacity', opacity);
  map.setPaintProperty(STRETCHES_LAYER_ID, 'line-opacity', opacity);
  map.setPaintProperty(STATIONS_LAYER_ID, 'circle-opacity', opacity);
  map.setPaintProperty(
    STATIONS_LAYER_ID,
    'circle-stroke-opacity',
    HALO * opacity,
  );
}

export default function RailMap({
  progress,
  stations,
  wholeIds,
  stretches,
}: {
  progress: RailLineProgress[];
  stations: RailStation[];
  /** Lines ridden end to end, drawn whole. */
  wholeIds: string[];
  /** The track between the stops of every other ride. */
  stretches: RailStretch[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const lines = useMemo(() => mapLines(progress), [progress]);
  const lineById = useMemo(
    () => new Map(lines.map(line => [line.id, line])),
    [lines],
  );
  const riddenIds = useMemo(
    () => lines.filter(({ touched }) => touched).map(({ id }) => id),
    [lines],
  );
  const sources = useMemo(
    () => sourcesFor(stations, stretches),
    [stations, stretches],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Read inside map handlers, which outlive the render that registered them.
  const selectedIdRef = useRef<string | null>(null);
  const selected = selectedId === null ? null : lineById.get(selectedId);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let map: MlMap | null = null;
    const ridden = new Set(riddenIds);

    // Read here and never during render, for the reason FlightGlobe gives.
    const dark = window.matchMedia('(prefers-color-scheme: dark)');
    const scheme = (): Scheme => (dark.matches ? 'dark' : 'light');
    const layers = () => layersFor(scheme(), wholeIds, selectedIdRef.current);

    /** Guarded for the reason `FlightGlobe.onStyleLoad` gives. */
    const onStyleLoad = () => {
      if (!map) return;
      for (const [id, source] of Object.entries(sources)) {
        if (!map.getSource(id)) map.addSource(id, source);
      }
      for (const layer of layers()) {
        if (!map.getLayer(layer.id)) map.addLayer(layer);
      }
    };

    const pointer = (over: boolean) => () => {
      if (map) map.getCanvas().style.cursor = over ? 'pointer' : '';
    };

    const build = () => {
      ensureMaplibreWorker();
      map = new MlMap({
        container,
        style: flatStyle(scheme()),
        // Fitted once, on construction, so it never animates into place.
        bounds: CH_FIT,
        fitBoundsOptions: { padding: 16 },
        maxBounds: CH_ROOM,
        renderWorldCopies: false,
        // Not `cooperativeGestures`, for the reason FlightGlobe gives.
        scrollZoom: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        // Nothing here moves on its own. MapLibre's inertia and zoom eases are
        // the only motion left, and this turns both into jumps.
        reduceMotion: prefersReducedMotion(),
        attributionControl: { compact: true },
      });
      map.touchZoomRotate.disableRotation();
      map.keyboard.disableRotation();
      mapRef.current = map;

      map.on('style.load', onStyleLoad);

      map.on('click', LINES_HIT_LAYER_ID, event => {
        const features = event.features ?? [];
        // Lines share track, so a tap routinely catches several. One that
        // was ridden is the likelier subject than the grey under it.
        const feature =
          features.find(({ properties }) => ridden.has(properties.id)) ??
          features[0];
        const id = feature?.properties.id;
        if (typeof id !== 'string' || !lineById.has(id)) return;

        setSelectedId(current => (current === id ? null : id));
      });

      map.on('click', event => {
        if (!map) return;
        const hits = map.queryRenderedFeatures(event.point, {
          layers: [LINES_HIT_LAYER_ID],
        });
        if (hits.length === 0) setSelectedId(null);
      });

      map.on('mouseenter', LINES_HIT_LAYER_ID, pointer(true));
      map.on('mouseleave', LINES_HIT_LAYER_ID, pointer(false));
    };

    /** `transformStyle` rather than a bare `setStyle`, as on the globe. */
    const transformStyle: TransformStyleFunction = (_previous, next) => ({
      ...next,
      sources: { ...next.sources, ...sources },
      layers: [...next.layers, ...layers()],
    });

    const onThemeChange = () => {
      map?.setStyle(flatStyle(scheme()), { transformStyle });
    };
    dark.addEventListener('change', onThemeChange);

    // No WebGL context and no megabyte of geometry for a reader who scrolls
    // past. Once built the map stays built.
    const observer = new IntersectionObserver(
      entries => {
        if (!map && entries.some(({ isIntersecting }) => isIntersecting)) {
          build();
          observer.disconnect();
        }
      },
      { rootMargin: PREBUILD_MARGIN },
    );
    observer.observe(container);

    return () => {
      observer.disconnect();
      dark.removeEventListener('change', onThemeChange);
      map?.remove();
      map = null;
      mapRef.current = null;
    };
  }, [sources, riddenIds, wholeIds, lineById]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
    const map = mapRef.current;
    if (map) applySelection(map, selectedId);
  }, [selectedId]);

  return (
    <div className="mt-8">
      {/*
        The same box as FlightGlobe's, for the same reasons, but sized by its
        aspect ratio rather than the viewport: Switzerland is wider than tall,
        and a fixed ratio reserves the height before the map exists.
      */}
      <div className="border-foreground/20 relative isolate aspect-4/3 w-full overflow-hidden rounded-lg border sm:aspect-16/10 [&_.maplibregl-ctrl-bottom-right]:mb-0">
        <div ref={containerRef} className="size-full" />
      </div>
      <Combobox.Root<RailMapLine>
        items={lines}
        value={selected ?? null}
        onValueChange={line => setSelectedId(line?.id ?? null)}
        itemToStringLabel={line => line.name}
        isItemEqualToValue={(item, value) => item.id === value.id}
      >
        <div className="border-foreground/20 focus-within:border-foreground/50 mt-3 flex h-10 items-center rounded-lg border">
          <Combobox.Input
            aria-label="Find a line"
            placeholder="Find a line"
            className="placeholder:text-muted h-full min-w-0 flex-1 bg-transparent px-3 text-sm outline-none"
          />
          <Combobox.Clear
            aria-label="Clear the line"
            className="text-muted hover:text-foreground flex size-10 shrink-0 items-center justify-center"
          >
            <span aria-hidden>×</span>
          </Combobox.Clear>
        </div>
        <Combobox.Portal>
          <Combobox.Positioner sideOffset={4} className="z-40">
            <Combobox.Popup className="border-foreground/20 bg-background max-h-[min(20rem,var(--available-height))] w-(--anchor-width) overflow-y-auto overscroll-contain rounded-lg border py-1 text-sm shadow-lg">
              <Combobox.Empty className="text-muted px-3 py-2 empty:hidden">
                No line by that name.
              </Combobox.Empty>
              <Combobox.List>
                {(line: RailMapLine) => (
                  <Combobox.Item
                    key={line.id}
                    value={line}
                    className="data-highlighted:bg-foreground/10 flex cursor-default items-center gap-2 px-3 py-2"
                  >
                    <span
                      aria-hidden
                      className="size-1.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor: line.touched ? ACCENT : 'transparent',
                      }}
                    />
                    <span className="truncate">{line.name}</span>
                  </Combobox.Item>
                )}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
      {/*
        The only readout of what is selected, so it is polite rather than
        silent. The name is already in the input above; a screen reader hears
        it here too. One line either way, so a selection never shifts the page.
      */}
      <p
        aria-live="polite"
        className="text-muted mt-2 truncate text-sm tabular-nums"
      >
        {selected ? (
          <>
            <span className="sr-only">{selected.name}: </span>
            {selected.detail}
          </>
        ) : (
          'Tap a line, or find one by name.'
        )}
      </p>
    </div>
  );
}
