import type { ConsensusVerdict, Monitor } from '@argus/db';
import type { FastifyBaseLogger } from 'fastify';
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../alert.js', () => ({ sendNtfy: vi.fn() }));

import { sendNtfy } from '../alert.js';
import { maybeAlertOnConsensus } from './alert.js';
import type { ConsensusOutcome } from './types.js';

const mockSendNtfy = vi.mocked(sendNtfy);

const monitor = {
  id: 'monitor-1',
  url: 'https://example.com',
} as Monitor;

const log = { info: vi.fn() } as unknown as FastifyBaseLogger;

function outcome(verdict: ConsensusVerdict, n = 3): ConsensusOutcome {
  return { verdict, n, confidence: 'high', medianDurationMs: verdict === 'up' ? 100 : null };
}

beforeEach(() => {
  mockSendNtfy.mockClear();
});

describe('maybeAlertOnConsensus', () => {
  test('fires a DOWN alert on up -> down', async () => {
    await maybeAlertOnConsensus(monitor, outcome('down'), 'up', log);
    expect(mockSendNtfy).toHaveBeenCalledTimes(1);
    expect(mockSendNtfy.mock.calls[0]?.[0]).toMatch(/^DOWN:/);
  });

  test('fires a RECOVERED alert on down -> up', async () => {
    await maybeAlertOnConsensus(monitor, outcome('up'), 'down', log);
    expect(mockSendNtfy).toHaveBeenCalledTimes(1);
    expect(mockSendNtfy.mock.calls[0]?.[0]).toMatch(/^RECOVERED:/);
  });

  test('does not alert on up -> up', async () => {
    await maybeAlertOnConsensus(monitor, outcome('up'), 'up', log);
    expect(mockSendNtfy).toHaveBeenCalledTimes(0);
  });

  test('does not alert on first-ever down (null previous)', async () => {
    await maybeAlertOnConsensus(monitor, outcome('down'), null, log);
    expect(mockSendNtfy).toHaveBeenCalledTimes(0);
  });

  test('does not alert on first-ever up (null previous)', async () => {
    await maybeAlertOnConsensus(monitor, outcome('up'), null, log);
    expect(mockSendNtfy).toHaveBeenCalledTimes(0);
  });

  test('does not alert when the new verdict is degraded', async () => {
    await maybeAlertOnConsensus(monitor, outcome('degraded'), 'up', log);
    expect(mockSendNtfy).toHaveBeenCalledTimes(0);
  });

  test('does not alert when the new verdict is insufficient_data', async () => {
    await maybeAlertOnConsensus(monitor, outcome('insufficient_data'), 'up', log);
    expect(mockSendNtfy).toHaveBeenCalledTimes(0);
  });

  test('alerts on up -> down even when previous alertable was up before a transient gap (Option B)', async () => {
    // previousVerdict comes from last_alertable_consensus, which is only ever 'up' | 'down' | null.
    // A transient degraded/insufficient_data in between does not overwrite it.
    await maybeAlertOnConsensus(monitor, outcome('down'), 'up', log);
    expect(mockSendNtfy).toHaveBeenCalledTimes(1);
  });

  test('fires both alerts in order on up -> down -> up', async () => {
    await maybeAlertOnConsensus(monitor, outcome('down'), 'up', log);
    await maybeAlertOnConsensus(monitor, outcome('up'), 'down', log);
    expect(mockSendNtfy).toHaveBeenCalledTimes(2);
    expect(mockSendNtfy.mock.calls[0]?.[0]).toMatch(/^DOWN:/);
    expect(mockSendNtfy.mock.calls[1]?.[0]).toMatch(/^RECOVERED:/);
  });
});
