import { maintenanceWindows, monitors } from '@argus/db';
import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { NotFoundError, ValidationError } from '../errors.js';
import { monitorIdParams } from '../openapi/common-schemas.js';

const maintenanceWindowResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    monitorId: { type: 'string' },
    startsAt: { type: 'string', format: 'date-time' },
    endsAt: { type: 'string', format: 'date-time' },
    label: { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
  },
} as const;

const maintenanceWindowIdParams = {
  type: 'object',
  required: ['id', 'windowId'],
  properties: {
    id: { type: 'string', description: 'Monitor id' },
    windowId: { type: 'string', description: 'Maintenance window id' },
  },
} as const;

async function requireMonitor(monitorId: string): Promise<void> {
  const monitor = await monitors.getMonitor(monitorId, config.monitorUserId);
  if (!monitor) throw new NotFoundError(`monitor ${monitorId} not found`);
}

export async function maintenanceRoutes(app: FastifyInstance) {
  app.post(
    '/monitors/:id/maintenance',
    {
      schema: {
        tags: ['maintenance'],
        summary: 'Schedule a maintenance window',
        description: 'Excluded from SLA uptime calculations for the monitor.',
        params: monitorIdParams,
        body: {
          type: 'object',
          required: ['startsAt', 'endsAt'],
          additionalProperties: false,
          properties: {
            startsAt: { type: 'string', format: 'date-time' },
            endsAt: { type: 'string', format: 'date-time' },
            label: { type: 'string', nullable: true },
          },
        },
        response: { 201: maintenanceWindowResponseSchema },
      },
    },
    async (req, reply) => {
      const { id: monitorId } = req.params as { id: string };
      const body = req.body as { startsAt: string; endsAt: string; label?: string | null };

      await requireMonitor(monitorId);

      const startsAt = new Date(body.startsAt);
      const endsAt = new Date(body.endsAt);
      if (endsAt.getTime() <= startsAt.getTime()) {
        throw new ValidationError('endsAt must be after startsAt');
      }

      const window = await maintenanceWindows.insertMaintenanceWindow({
        monitorId,
        startsAt,
        endsAt,
        label: body.label,
      });

      reply.status(201);
      return window;
    },
  );

  app.get(
    '/monitors/:id/maintenance',
    {
      schema: {
        tags: ['maintenance'],
        summary: 'List maintenance windows',
        params: monitorIdParams,
        response: { 200: { type: 'array', items: maintenanceWindowResponseSchema } },
      },
    },
    async (req) => {
      const { id: monitorId } = req.params as { id: string };
      await requireMonitor(monitorId);
      return maintenanceWindows.listMaintenanceWindows(monitorId);
    },
  );

  app.delete(
    '/monitors/:id/maintenance/:windowId',
    {
      schema: {
        tags: ['maintenance'],
        summary: 'Delete a maintenance window',
        params: maintenanceWindowIdParams,
        response: { 204: { type: 'null', description: 'Window deleted' } },
      },
    },
    async (req, reply) => {
      const { id: monitorId, windowId } = req.params as { id: string; windowId: string };
      await requireMonitor(monitorId);

      const deleted = await maintenanceWindows.deleteMaintenanceWindow(windowId, monitorId);
      if (!deleted) throw new NotFoundError(`maintenance window ${windowId} not found`);

      reply.status(204).send();
    },
  );
}
