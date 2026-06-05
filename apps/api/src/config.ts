function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  monitorUserId: requireEnv('MONITOR_USER_ID'),
  ntfyTopicUrl: requireEnv('NTFY_TOPIC_URL'),
  // pg-boss is constructed in the api process, so the api needs the connection string
  // directly. The db package validates DATABASE_URL for its own pool; this is a second,
  // independent read for the queue's own connection.
  databaseUrl: requireEnv('DATABASE_URL'),
};
