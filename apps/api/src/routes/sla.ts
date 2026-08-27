import type { FastifyInstance } from 'fastify';
import { attachMonitorUser, requireMonitorUser } from '../auth/resolve-user.js';
import { NotFoundError, ValidationError } from '../errors.js';
import { monitorIdParams } from '../openapi/common-schemas.js';
import { computeSla } from '../sla/compute.js';

const slaResponseSchema = {
  type: 'object',
  properties: {
    monitorId: { type: 'string' },
    window: {
      type: 'object',
      properties: {
        from: { type: 'string', format: 'date-time' },
        to: { type: 'string', format: 'date-time' },
        effectiveFrom: { type: 'string', format: 'date-time' },
        effectiveTo: { type: 'string', format: 'date-time' },
      },
    },
    sli: {
      type: 'object',
      properties: {
        totalMinutes: { type: 'number' },
        maintenanceMinutes: { type: 'number' },
        coverageGapMinutes: { type: 'number' },
        monitoredMinutes: { type: 'number' },
        downtimeMinutes: { type: 'number' },
        uptimePercent: { type: 'number', nullable: true },
        lowConfidence: { type: 'boolean' },
      },
    },
    incidents: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          from: { type: 'string', format: 'date-time' },
          to: { type: 'string', format: 'date-time' },
          minutes: { type: 'number' },
        },
      },
    },
    slo: {
      type: 'object',
      nullable: true,
      properties: {
        target: { type: 'number' },
        met: { type: 'boolean' },
        errorBudget: {
          type: 'object',
          properties: {
            totalMinutes: { type: 'number' },
            consumedMinutes: { type: 'number' },
            remainingMinutes: { type: 'number' },
            remainingPercent: { type: 'number' },
          },
        },
      },
    },
  },
} as const;

export async function slaRoutes(app: FastifyInstance) {
  app.addHook('preHandler', attachMonitorUser);

  app.get(
    '/monitors/:id/sla',
    {
      schema: {
        tags: ['sla'],
        summary: 'SLA uptime for a monitor',
        description:
          'FSM down-time only. Maintenance windows and coverage gaps excluded from the denominator. Optional ?slo= target for error-budget math.',
        params: monitorIdParams,
        querystring: {
          type: 'object',
          required: ['from', 'to'],
          additionalProperties: false,
          properties: {
            from: { type: 'string', format: 'date-time' },
            to: { type: 'string', format: 'date-time' },
            slo: { type: 'number', description: 'Optional SLO target percent (0–100 exclusive)' },
          },
        },
        response: { 200: slaResponseSchema },
      },
    },
    async (req) => {
      const { id: monitorId } = req.params as { id: string };
      const { from, to, slo } = req.query as { from: string; to: string; slo?: number };

      const fromDate = new Date(from);
      const toDate = new Date(to);

      if (fromDate.getTime() >= toDate.getTime()) throw new ValidationError('Invalid date params');
      if (slo !== undefined) {
        if (slo <= 0 || slo >= 100) throw new ValidationError('Invalid slo score');
      }

      const result = await computeSla(
        monitorId,
        requireMonitorUser(req).userId,
        fromDate,
        toDate,
        slo,
      );
      if (!result) throw new NotFoundError(`monitor ${monitorId} not found`);
      return result;
    },
  );
}
