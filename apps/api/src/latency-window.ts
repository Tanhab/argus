export type LatencyWindow = '1h' | '24h';

export function latencyWindowRange(window: LatencyWindow): {
  bucketInterval: string;
  from: Date;
  to: Date;
  origin: Date;
} {
  const to = new Date();
  const spanMs = window === '1h' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const from = new Date(to.getTime() - spanMs);
  const bucketInterval = window === '1h' ? '30 seconds' : '5 minutes';
  return { bucketInterval, from, to, origin: from };
}
