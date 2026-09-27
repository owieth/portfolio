/**
 * The part of MapLibre that a lazily built map constructs.
 *
 * Named on purpose. `import('maplibre-gl')` hands back the whole namespace,
 * and Turbopack then keeps every export of the library's one module instead of
 * the handful the static imports use, about 30 KB more. That module is shared
 * with /play, which imports it statically, so /play would pay for it too.
 * Re-exporting by name keeps the pruning. A map that needs another class adds
 * it here.
 */
export { Map, NavigationControl } from 'maplibre-gl';
