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
 * It goes through `subset.ts` rather than `maplibre-gl` itself, for the reason
 * given there. `worker.ts` is imported lazily too because it imports
 * MapLibre's values at module scope: a static import of it here would pull the
 * library straight back into the initial set.
 *
 * Every caller gets the same promise, and the worker is pointed once before
 * any map is built. A rejected promise is dropped, so the next build asks
 * again; whether that retry can succeed without a reload is up to the
 * bundler's chunk cache.
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
