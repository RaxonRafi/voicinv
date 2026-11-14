import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// Unit tests run in Node: content parity, formatting, web app rules and server-rendered markup.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.test.{ts,tsx}', 'design-tokens/**/*.test.ts'],
  },
});
