import type { ConsensusVerdict, MonitorStatus } from '@argus/db';
import {
  alertOutbox,
  anomalyEvents,
  type Monitor,
  monitors,
  results,
  statusEvents,
} from '@argus/db';
import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { NotFoundError, ValidationError } from '../errors.js';
import { monitorIdParams } from '../openapi/common-schemas.js';
import { computeSla } from '../sla/compute.js';

const showcaseIds = new Set(config.publicShowcaseMonitorIds);

export interface PublicMonitor {
  id: string;
  url: string;
  intervalSeconds: number;
  isActive: boolean;
  createdAt: Date;
  deactivatedAt: Date | null;
  lastConsensus: ConsensusVerdict | null;
  lastConsensusAt: Date | null;
  status: MonitorStatus;
  statusChangedAt: Date | null;
}

const publicMonitorSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    url: { type: 'string' },
    intervalSeconds: { type: 'integer' },
    isActive: { type: 'boolean' },
    createdAt: { type: 'string', format: 'date-time' },
    deactivatedAt: { type: 'string', format: 'date-time', nullable: true },
    lastConsensus: { type: 'string', nullable: true },
    lastConsensusAt: { type: 'string', format: 'date-time', nullable: true },
    status: { type: 'string' },
    statusChangedAt: { type: 'string', format: 'date-time', nullable: true },
  },
} as const;

const checkResultSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    monitorId: { type: 'string' },
    checkerId: { type: 'string' },
    statusCode: { type: 'integer', nullable: true },
    durationMs: { type: 'integer', nullable: true },
    isUp: { type: 'boolean' },
    errorType: { type: 'string', nullable: true },
    checkedAt: { type: 'string', format: 'date-time' },
  },
} as const;

const anomalySchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    monitorId: { type: 'string' },
    direction: { type: 'string' },
    zScore: { type: 'number' },
    durationMs: { type: 'number' },
    baselineEwma: { type: 'number' },
    baselineStdDev: { type: 'number' },
    checkerId: { type: 'string', nullable: true },
    scope: { type: 'string' },
    occurredAt: { type: 'string', format: 'date-time' },
  },
} as const;

const bucketedLatencySchema = {
  type: 'object',
  properties: {
    bucket: { type: 'string', format: 'date-time' },
    checkerId: { type: 'string' },
    avgMs: { type: 'number', nullable: true },
    p95Ms: { type: 'number', nullable: true },
    downCount: { type: 'integer' },
    total: { type: 'integer' },
  },
} as const;

const statusEventSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    monitorId: { type: 'string' },
    fromStatus: { type: 'string' },
    toStatus: { type: 'string' },
    occurredAt: { type: 'string', format: 'date-time' },
  },
} as const;

const deliveredAlertSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    monitorId: { type: 'string' },
    kind: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    sentAt: { type: 'string', format: 'date-time' },
  },
} as const;

type LatencyWindow = '1h' | '24h';

function latencyWindowRange(window: LatencyWindow): {
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

function toPublicMonitor(m: Monitor): PublicMonitor {
  return {
    id: m.id,
    url: m.url,
    intervalSeconds: m.intervalSeconds,
    isActive: m.isActive,
    createdAt: m.createdAt,
    deactivatedAt: m.deactivatedAt,
    lastConsensus: m.lastConsensus,
    lastConsensusAt: m.lastConsensusAt,
    status: m.status,
    statusChangedAt: m.statusChangedAt,
  };
}

function assertShowcaseMonitor(id: string): void {
  if (!showcaseIds.has(id)) {
    throw new NotFoundError(`monitor ${id} not found`);
  }
}

export async function publicRoutes(app: FastifyInstance) {
  app.get(
    '/public/monitors',
    {
      schema: {
        tags: ['public'],
        summary: 'List showcase monitors',
        description:
          'Read-only, unauthenticated. Returns only monitors in PUBLIC_SHOWCASE_MONITOR_IDS.',
        response: { 200: { type: 'array', items: publicMonitorSchema } },
      },
    },
    async () => {
      const rows = await monitors.getMonitorsByIds(config.publicShowcaseMonitorIds);
      return rows.map(toPublicMonitor);
    },
  );

  app.get(
    '/public/monitors/:id',
    {
      schema: {
        tags: ['public'],
        summary: 'Get a showcase monitor',
        params: monitorIdParams,
        response: { 200: publicMonitorSchema },
      },
    },
    async (req) => {
      const { id } = req.params as { id: string };
      assertShowcaseMonitor(id);
      const monitor = await monitors.getMonitorById(id);
      if (!monitor) throw new NotFoundError(`monitor ${id} not found`);
      return toPublicMonitor(monitor);
    },
  );

  app.get(
    '/public/monitors/:id/results',
    {
      schema: {
        tags: ['public'],
        summary: 'Recent check results for a showcase monitor',
        params: monitorIdParams,
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          },
        },
        response: { 200: { type: 'array', items: checkResultSchema } },
      },
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const { limit } = req.query as { limit: number };
      assertShowcaseMonitor(id);
      const monitor = await monitors.getMonitorById(id);
      if (!monitor) throw new NotFoundError(`monitor ${id} not found`);
      return results.getRecentResults(id, limit);
    },
  );

  app.get(
    '/public/monitors/:id/anomalies',
    {
      schema: {
        tags: ['public'],
        summary: 'Recent anomaly events for a showcase monitor',
        params: monitorIdParams,
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          },
        },
        response: { 200: { type: 'array', items: anomalySchema } },
      },
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const { limit } = req.query as { limit: number };
      assertShowcaseMonitor(id);
      const monitor = await monitors.getMonitorById(id);
      if (!monitor) throw new NotFoundError(`monitor ${id} not found`);
      return anomalyEvents.getRecentAnomalies(id, limit);
    },
  );

  app.get(
    '/public/monitors/:id/latency',
    {
      schema: {
        tags: ['public'],
        summary: 'Bucketed per-checker latency for a showcase monitor',
        params: monitorIdParams,
        querystring: {
          type: 'object',
          required: ['window'],
          additionalProperties: false,
          properties: {
            window: { type: 'string', enum: ['1h', '24h'] },
          },
        },
        response: { 200: { type: 'array', items: bucketedLatencySchema } },
      },
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const { window } = req.query as { window: LatencyWindow };
      assertShowcaseMonitor(id);
      const monitor = await monitors.getMonitorById(id);
      if (!monitor) throw new NotFoundError(`monitor ${id} not found`);

      const { bucketInterval, from, to, origin } = latencyWindowRange(window);
      return results.getBucketedResults(id, bucketInterval, from, to, origin);
    },
  );

  app.get(
    '/public/monitors/:id/transitions',
    {
      schema: {
        tags: ['public'],
        summary: 'Recent FSM transitions for a showcase monitor',
        params: monitorIdParams,
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          },
        },
        response: { 200: { type: 'array', items: statusEventSchema } },
      },
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const { limit } = req.query as { limit: number };
      assertShowcaseMonitor(id);
      const monitor = await monitors.getMonitorById(id);
      if (!monitor) throw new NotFoundError(`monitor ${id} not found`);
      return statusEvents.getRecentStatusEvents(id, limit);
    },
  );

  app.get(
    '/public/monitors/:id/alerts',
    {
      schema: {
        tags: ['public'],
        summary: 'Recent delivered alerts for a showcase monitor',
        params: monitorIdParams,
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          },
        },
        response: { 200: { type: 'array', items: deliveredAlertSchema } },
      },
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const { limit } = req.query as { limit: number };
      assertShowcaseMonitor(id);
      const monitor = await monitors.getMonitorById(id);
      if (!monitor) throw new NotFoundError(`monitor ${id} not found`);
      return alertOutbox.getRecentDeliveredAlerts(id, limit);
    },
  );

  app.get(
    '/public/monitors/:id/sla',
    {
      schema: {
        tags: ['public'],
        summary: 'SLA uptime for a showcase monitor',
        params: monitorIdParams,
        querystring: {
          type: 'object',
          required: ['from', 'to'],
          additionalProperties: false,
          properties: {
            from: { type: 'string', format: 'date-time' },
            to: { type: 'string', format: 'date-time' },
            slo: { type: 'number' },
          },
        },
      },
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const { from, to, slo } = req.query as { from: string; to: string; slo?: number };
      assertShowcaseMonitor(id);

      const monitor = await monitors.getMonitorById(id);
      if (!monitor) throw new NotFoundError(`monitor ${id} not found`);

      const fromDate = new Date(from);
      const toDate = new Date(to);
      if (fromDate.getTime() >= toDate.getTime()) throw new ValidationError('Invalid date params');
      if (slo !== undefined && (slo <= 0 || slo >= 100)) {
        throw new ValidationError('Invalid slo score');
      }

      const result = await computeSla(monitor.id, monitor.userId, fromDate, toDate, slo);
      if (!result) throw new NotFoundError(`monitor ${id} not found`);
      return result;
    },
  );
}
