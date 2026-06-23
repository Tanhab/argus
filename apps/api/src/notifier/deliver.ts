import type { FastifyBaseLogger } from 'fastify';
import { config } from '../config.js';
import type { AlertJob } from './alert-job.js';

export async function deliverAlertJob(job: AlertJob, log?: FastifyBaseLogger): Promise<void> {
  if (job.kind === 'anomaly') {
    await publishNtfy(
      `SLOW: ${job.monitorUrl}`,
      `responding ${job.direction} than baseline — ${Math.round(job.durationMs)}ms vs ~${Math.round(job.baselineEwma)}ms (z=${job.zScore.toFixed(1)})`,
      job.direction === 'slower' ? 'high' : 'default',
      ['turtle'],
    );
    log?.info(
      { kind: job.kind, monitorUrl: job.monitorUrl, zScore: job.zScore },
      'anomaly alert delivered',
    );
    return;
  }

  if (job.reason === 'down_declared') {
    await publishNtfy(
      `DOWN: ${job.monitorUrl}`,
      `state machine declared down (${job.n} checkers)`,
      'high',
      ['rotating_light'],
    );
  } else {
    await publishNtfy(
      `RECOVERED: ${job.monitorUrl}`,
      `state machine declared recovered (${job.n} checkers)`,
      'default',
      ['white_check_mark'],
    );
  }
  log?.info({ kind: job.kind, reason: job.reason, monitorUrl: job.monitorUrl }, 'alert delivered');
}

async function publishNtfy(
  title: string,
  body: string,
  priority: 'low' | 'default' | 'high' | 'urgent',
  tags: string[],
): Promise<void> {
  const res = await fetch(config.ntfyTopicUrl, {
    method: 'POST',
    body,
    headers: {
      Title: title,
      Priority: priority,
      Tags: tags.join(','),
    },
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) {
    throw new Error(`ntfy publish failed with status ${res.status}`);
  }
}
