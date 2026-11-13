import { defineConfig } from 'vitest/config';

// End-to-end tests: boot the real app against a real Postgres (TEST_DATABASE_URL).
// Every spec file works inside its own throwaway schema, so files can run in parallel.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    setupFiles: ['./test/support/load-env.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
