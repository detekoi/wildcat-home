import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    // `public/` is Eleventy build output (gitignored) and holds a full copy of every
    // test in `src/`. Without this, each run executes both copies — and the duplicates
    // only refresh on `npm run build`, so they silently test stale code, masking real
    // regressions in `src/` and failing for reasons unrelated to the source.
    exclude: ['**/node_modules/**', '**/public/**'],
  },
});
