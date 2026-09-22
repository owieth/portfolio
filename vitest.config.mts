import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    // Repo-root-relative, so rail/ needs its own entry: without it the pipeline
    // tests are silently skipped here and in CI rather than reported as failing.
    include: ['src/**/*.test.ts', 'rail/src/**/*.test.ts'],
  },
});
