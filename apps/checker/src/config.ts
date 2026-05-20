function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`missing required env var: ${key}`);
  return v;
}

export const config = {
  checkerId: requireEnv('CHECKER_ID'),
  apiUrl: requireEnv('API_URL'),
  apiKey: requireEnv('API_KEY'),
  syncIntervalMs: Number(process.env.SYNC_INTERVAL_MS ?? 60_000),
  heartbeatIntervalMs: Number(process.env.HEARTBEAT_INTERVAL_MS ?? 60_000),
  checkTimeoutMs: Number(process.env.CHECK_TIMEOUT_MS ?? 10_000),
};
