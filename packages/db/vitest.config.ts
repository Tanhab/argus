import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    env: { DATABASE_URL: 'postgres://placeholder' },
    // testcontainers boot can take a while on a cold Docker daemon
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
