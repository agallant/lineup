import { defineConfig } from 'vitest/config';

// Build metadata shown in the app footer, so it's obvious on the iPad which
// build Safari is actually running. CI sets these; local builds say "dev".
const buildSha = (process.env.BUILD_SHA ?? 'dev').slice(0, 7);
const buildLabel = process.env.BUILD_LABEL ?? 'local';

export default defineConfig({
  // Relative base so the same build works at the Pages root and under
  // /pr-preview/pr-N/ without knowing the path at build time.
  base: './',
  define: {
    __BUILD_SHA__: JSON.stringify(buildSha),
    __BUILD_LABEL__: JSON.stringify(buildLabel),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    target: 'safari15',
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
