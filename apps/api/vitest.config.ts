import { defineConfig } from 'vitest/config';

// Unit tests: no database, no network.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts', 'src/**/__tests__/**/*.test.ts'],
  },
});
