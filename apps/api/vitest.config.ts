import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    env: {
      DATABASE_URL: 'postgres://placeholder',
      NTFY_TOPIC_URL: 'https://ntfy.sh/test',
      CHECKER_ID: 'local',
      PUBLIC_SHOWCASE_MONITOR_IDS:
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa,bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    },
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
