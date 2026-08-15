import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.runtime.test.ts', 'src/**/*.test.ts'],
    testTimeout: 20_000,
  },
});
