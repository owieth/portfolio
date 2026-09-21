/**
 * Copies MapLibre's worker into `public/maplibre/`.
 *
 * MapLibre 6 ships the worker as a separate ES module that imports
 * `./maplibre-gl-shared.mjs` relative to itself, and resolves its own URL from
 * `import.meta.url` — which stops being an http URL once the library is
 * bundled, so the library falls back to a worker that never answers.
 *
 * Pointing it at a bundler-emitted asset does not help: the emitted file keeps
 * the relative import but its sibling is never emitted alongside it, and the
 * hashed filenames would not match anyway. Both files have to sit next to each
 * other under their own names, which is what `public/` is for.
 *
 * Run from `dev` and `build` rather than a `prebuild` hook, because pnpm does
 * not run pre/post scripts unless `enable-pre-post-scripts` is turned on.
 */
import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const FILES = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];

const dist = dirname(
  createRequire(import.meta.url).resolve('maplibre-gl/dist/maplibre-gl.mjs'),
);
const out = join(process.cwd(), 'public', 'maplibre');

await mkdir(out, { recursive: true });
await Promise.all(
  FILES.map(file => copyFile(join(dist, file), join(out, file))),
);
