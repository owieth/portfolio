import { getVersion, getWorkerUrl, setWorkerUrl } from 'maplibre-gl';

/** Where `scripts/maplibre-worker.mjs` puts the worker and its sibling chunk. */
const WORKER_PATH = '/maplibre/maplibre-gl-worker.mjs';

/**
 * Points MapLibre at its own worker. Call this before constructing a map.
 *
 * MapLibre 6 ships the worker as a separate ES module and resolves it from
 * `import.meta.url`:
 *
 * ```js
 * let e = import.meta.url;
 * if (!/^https?:/.test(e)) return '';
 * ```
 *
 * Once bundled that is no longer an http URL, so the guard returns an empty
 * string and the map runs with a worker that never answers. Nothing throws and
 * no `error` event fires: the style loads, `addSource` and `addLayer` succeed,
 * tiles enter the viewport and simply never parse. Raster sources still draw,
 * because those are decoded on the main thread — so the symptom is a globe
 * painted in its background colour and nothing else on it.
 *
 * The version query busts the browser cache on an upgrade. It does not reach
 * the worker's own `./maplibre-gl-shared.mjs` import, which resolves against
 * the path and drops the query.
 */
export function ensureMaplibreWorker(): void {
  if (typeof window === 'undefined' || getWorkerUrl()) return;

  setWorkerUrl(`${WORKER_PATH}?v=${getVersion()}`);
}
