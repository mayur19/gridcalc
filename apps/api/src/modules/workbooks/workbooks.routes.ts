import {
  createSheetSchema,
  createWorkbookSchema,
  parseRangeA1,
  patchCellsSchema,
} from '@gridcalc/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../http/errors.js';
import { ok } from '../../http/envelope.js';
import { parseInput } from '../../http/validate.js';
import { requireAuth, requirePermission } from '../auth/auth.plugin.js';
import type { WorkbookService } from './workbook.service.js';

const workbookParams = z.object({ workbookId: z.string().uuid() });
const sheetParams = workbookParams.extend({ sheetId: z.string().uuid() });
const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});
const cellsQuery = z.object({ range: z.string().max(32).optional() });

/** Maximum cells returned by one window read; larger sheets are paged by the client. */
const MAX_WINDOW_AREA = 250_000;

export function registerWorkbookRoutes(app: FastifyInstance, service: WorkbookService): void {
  app.get(
    '/api/v1/workbooks',
    { preHandler: requirePermission('workbook:read') },
    async (request) => {
      const { limit, offset } = parseInput(listQuery, request.query);
      const { rows, total } = await service.list(requireAuth(request), limit, offset);
      return ok(rows, { total, limit, offset });
    },
  );

  app.post(
    '/api/v1/workbooks',
    { preHandler: requirePermission('workbook:create') },
    async (request, reply) => {
      const input = parseInput(createWorkbookSchema, request.body);
      const workbook = await service.create(requireAuth(request), input, request.id);
      return reply.status(201).send(ok(workbook));
    },
  );

  app.get(
    '/api/v1/workbooks/:workbookId',
    { preHandler: requirePermission('workbook:read') },
    async (request) => {
      const { workbookId } = parseInput(workbookParams, request.params);
      return ok(await service.get(requireAuth(request), workbookId));
    },
  );

  app.post(
    '/api/v1/workbooks/:workbookId/sheets',
    { preHandler: requirePermission('workbook:write') },
    async (request, reply) => {
      const { workbookId } = parseInput(workbookParams, request.params);
      const input = parseInput(createSheetSchema, request.body);
      const result = await service.addSheet(requireAuth(request), workbookId, input, request.id);
      return reply.status(201).send(ok(result));
    },
  );

  app.get(
    '/api/v1/workbooks/:workbookId/sheets/:sheetId/cells',
    { preHandler: requirePermission('workbook:read') },
    async (request) => {
      const { workbookId, sheetId } = parseInput(sheetParams, request.params);
      const { range } = parseInput(cellsQuery, request.query);
      const window =
        range === undefined
          ? { top: 0, left: 0, bottom: 1_048_575, right: 16_383 }
          : parseRangeA1(sheetId, range);
      if (!window) throw new AppError('VALIDATION_FAILED', `Invalid range '${range}'`);
      if (
        range !== undefined &&
        (window.bottom - window.top + 1) * (window.right - window.left + 1) > MAX_WINDOW_AREA
      ) {
        throw new AppError(
          'VALIDATION_FAILED',
          `Range windows are limited to ${MAX_WINDOW_AREA} cells`,
        );
      }
      const result = await service.listCells(requireAuth(request), workbookId, sheetId, window);
      return ok(result.cells, { revision: result.revision, count: result.cells.length });
    },
  );

  app.patch(
    '/api/v1/workbooks/:workbookId/cells',
    { preHandler: requirePermission('workbook:write') },
    async (request) => {
      const { workbookId } = parseInput(workbookParams, request.params);
      const input = parseInput(patchCellsSchema, request.body);
      return ok(await service.patchCells(requireAuth(request), workbookId, input));
    },
  );
}
