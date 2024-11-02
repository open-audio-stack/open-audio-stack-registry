import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '*.spec.ts',
  use: {
    baseURL: 'https://open-audio-stack.github.io/open-audio-stack-registry/',
  },
});
