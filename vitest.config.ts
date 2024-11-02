/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    include: ['./tests/**/*.test.ts'],
    coverage: {
      enabled: true,
      include: ['**/src/**'],
      exclude: ['./src/index.ts', './src/index-browser.ts'],
    },
  },
});
