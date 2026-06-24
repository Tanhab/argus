import { createHash } from 'node:crypto';

export function demoOwnerFromIp(ip: string): string {
  const digest = createHash('sha256').update(ip).digest('hex');
  return `demo:${digest}`;
}
