function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
}

function parseShowcaseMonitorIds(raw: string): string[] {
  const ids = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0) throw new Error('PUBLIC_SHOWCASE_MONITOR_IDS must list at least one id');
  return ids;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  monitorUserId: requireEnv('MONITOR_USER_ID'),
  ntfyTopicUrl: requireEnv('NTFY_TOPIC_URL'),
  databaseUrl: requireEnv('DATABASE_URL'),
  demoTokenTtlHours: Number(process.env.DEMO_TOKEN_TTL_HOURS ?? 4),
  demoMaxActiveTokens: Number(process.env.DEMO_MAX_ACTIVE_TOKENS ?? 50),
  demoMonitorQuota: Number(process.env.DEMO_MONITOR_QUOTA ?? 3),
  demoCookieName: 'argus_demo',
  publicShowcaseMonitorIds: parseShowcaseMonitorIds(requireEnv('PUBLIC_SHOWCASE_MONITOR_IDS')),
};
