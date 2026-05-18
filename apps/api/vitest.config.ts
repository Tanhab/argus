import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    env: {
      DATABASE_URL: 'postgres://placeholder',
      MONITOR_USER_ID: 'test-user',
      NTFY_TOPIC_URL: 'https://ntfy.sh/test',
    },
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
