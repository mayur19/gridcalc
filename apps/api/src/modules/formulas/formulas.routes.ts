import {
  collectPrecedents,
  listFunctions,
  parseFormulaSchema,
  printFormula,
  tryParseFormula,
} from '@gridcalc/shared';
import type { FastifyInstance } from 'fastify';
import { ok } from '../../http/envelope.js';
import { parseInput } from '../../http/validate.js';
import { requirePermission } from '../auth/auth.plugin.js';

/** Formula tooling for the formula bar: syntax check, canonical form, referenced cells. */
export function registerFormulaRoutes(app: FastifyInstance): void {
  app.get(
    '/api/v1/formulas/functions',
    { preHandler: requirePermission('workbook:read') },
    async () => {
      const functions = listFunctions();
      return ok(functions, { count: functions.length });
    },
  );

  app.post(
    '/api/v1/formulas/parse',
    { preHandler: requirePermission('workbook:read') },
    async (request) => {
      const { formula } = parseInput(parseFormulaSchema, request.body);
      const source = formula.startsWith('=') ? formula.slice(1) : formula;
      const result = tryParseFormula(source);
      if (!result.ok) {
        return ok({ valid: false as const, message: result.message, position: result.position });
      }
      const precedents = collectPrecedents(result.ast, 'current', (name) => name);
      return ok({
        valid: true as const,
        normalized: `=${printFormula(result.ast)}`,
        ast: result.ast,
        references: {
          cells: precedents.cells.map(({ sheetId, row, col }) => ({
            sheet: sheetId === 'current' ? null : sheetId,
            row,
            col,
          })),
          ranges: precedents.ranges.map(({ sheetId, ...rest }) => ({
            sheet: sheetId === 'current' ? null : sheetId,
            ...rest,
          })),
        },
      });
    },
  );
}
