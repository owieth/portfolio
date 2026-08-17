/**
 * Lets the plain .mjs scripts import the app's TypeScript source directly, so
 * a published number can never drift from the constant it was measured on.
 *
 * Node strips the type annotations by itself. The one thing it cannot do is
 * resolve the `@/` alias from tsconfig.json, which is what the hook below adds.
 *
 * Call this before touching any app module, and reach for app source with
 * top-level `await import()` rather than a static import: Node resolves an
 * entire static import graph before evaluating a single line of it, so a
 * static import would hit an unresolved `@/` long before the hook is armed.
 *
 * The query string is carried through so a caller can force a fresh module
 * instance with `@/…/mechanics?session=3`.
 */

import { registerHooks } from 'node:module';

const SRC = new URL('../../src/', import.meta.url);

export function registerAlias() {
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (!specifier.startsWith('@/')) return nextResolve(specifier, context);

      const [path, query] = specifier.slice(2).split('?');
      const ziel = new URL(`${path}.ts${query ? `?${query}` : ''}`, SRC);
      return nextResolve(ziel.href, context);
    },
  });
}
