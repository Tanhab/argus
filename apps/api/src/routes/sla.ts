import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { NotFoundError, ValidationError } from '../errors.js';
import { computeSla } from '../sla/compute.js';

export async function slaRoutes(app: FastifyInstance) {
  app.get(
    '/monitors/:id/sla',
    {
      schema: {
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
      const { id: monitorId } = req.params as { id: string };
      const { from, to, slo } = req.query as { from: string; to: string; slo?: number };

      const fromDate = new Date(from);
      const toDate = new Date(to);

      if (fromDate.getTime() >= toDate.getTime()) throw new ValidationError('Invalid date params');
      if (slo !== undefined) {
        if (slo <= 0 || slo >= 100) throw new ValidationError('Invalid slo score');
      }

      const result = await computeSla(monitorId, config.monitorUserId, fromDate, toDate, slo);
      if (!result) throw new NotFoundError(`monitor ${monitorId} not found`);
      return result;
    },
  );
}
