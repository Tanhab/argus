import { createLogger } from '@argus/logger';
import { config } from './config.js';

const log = createLogger('checker');

export async function sendNtfy(
  title: string,
  body: string,
  priority?: 'low' | 'default' | 'high' | 'urgent',
  tags?: string[],
) {
  try {
    const res = await fetch(config.ntfyTopicUrl, {
      method: 'POST',
      body: body,
      headers: {
        Title: title,
        Priority: priority ?? 'default',
        Tags: (tags ?? []).join(','),
      },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      log.warn({ status: res.status }, 'ntfy publish failed');
    }
  } catch (error) {
    log.warn({ err: error }, 'ntfy publish failed');
  }
}
