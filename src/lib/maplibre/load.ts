const MAPLIBRE_URL = '/maplibre/maplibre-gl.mjs';

type Maplibre = typeof import('maplibre-gl');

let loading: Promise<Maplibre> | null = null;

/**
 * MapLibre, fetched the first time a map is about to build.
 *
 * Imported statically, the library, about 287 KB gzipped, lands in the
 * initial JS of /stats. Turbopack groups it with the page's other client
 * modules, and React hydrates a client component only once all of its chunks
 * have loaded, so everything grouped with it, down to the header's links,
 * waits on a download only the maps use.
 *
 * It is not bundled either. The worker, which `scripts/maplibre-worker.mjs`
 * copies into `public/maplibre/`, imports `./maplibre-gl-shared.mjs` from
 * beside itself, and a bundled copy of the library carries that same module
 * inlined, so a cold visit downloaded its ~146 KB gzipped twice. Imported from
 * the same directory, the main module resolves the same URL as the worker.
 *
 * The URL is a constant because TypeScript tries to resolve a string literal
 * as a module and fails. Loaded natively, `import.meta.url` is a real http URL,
 * so MapLibre finds its worker by itself: `ensureMaplibreWorker` configures
 * only the bundled instance /play uses, and importing `worker.ts` here would
 * bundle the library back in.
 *
 * Every caller gets the same promise. A rejected promise is dropped, so the
 * next build asks again, though the browser may keep a failed module fetch
 * until the page reloads.
 */
export function loadMaplibre(): Promise<Maplibre> {
  loading ??= (
    import(
      /* turbopackIgnore: true */ /* webpackIgnore: true */ MAPLIBRE_URL
    ) as Promise<Maplibre>
  ).catch((error: unknown) => {
    loading = null;
    throw error;
  });

  return loading;
}
