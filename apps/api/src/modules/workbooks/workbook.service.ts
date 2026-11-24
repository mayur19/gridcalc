import {
  RecalcEngine,
  toCellValueDto,
  type CellDto,
  type ComputedCell,
  type CreateSheetInput,
  type CreateWorkbookInput,
  type PatchCellsInput,
} from '@gridcalc/shared';
import type { PoolClient } from 'pg';
import type { AppConfig } from '../../config/env.js';
import { withTransaction, type Db } from '../../db/pool.js';
import { AppError, notFound } from '../../http/errors.js';
import { recordAuditEvent } from '../audit/audit.repository.js';
import type { AuthContext } from '../auth/auth.types.js';
import type { EngineCache } from './engine-cache.js';
import * as repo from './workbook.repository.js';

export interface CommitResult {
  readonly revision: number;
  readonly changed: readonly CellDto[];
  readonly evaluated: number;
  readonly cycles: number;
}

const DEFAULT_SHEET_NAME = 'Sheet1';

export class WorkbookService {
  constructor(
    private readonly db: Db,
    private readonly cache: EngineCache,
    private readonly config: AppConfig,
  ) {}

  list(auth: AuthContext, limit: number, offset: number) {
    return repo.listWorkbooks(this.db, auth.organizationId, limit, offset);
  }

  async create(auth: AuthContext, input: CreateWorkbookInput, requestId: string) {
    return withTransaction(this.db, async (tx) => {
      const workbook = await repo.insertWorkbook(tx, auth.organizationId, input.name, auth.userId);
      const sheet = await repo.insertSheet(tx, workbook.id, DEFAULT_SHEET_NAME, 0);
      await repo.insertRevision(tx, {
        workbookId: workbook.id,
        revision: workbook.revision,
        actorUserId: auth.userId,
        kind: 'workbook.created',
        editCount: 0,
        recalculated: 0,
        payload: { name: input.name },
      });
      await recordAuditEvent(tx, {
        organizationId: auth.organizationId,
        actorUserId: auth.userId,
        action: 'workbook.created',
        targetType: 'workbook',
        targetId: workbook.id,
        metadata: { name: input.name },
        requestId,
      });
      return { ...workbook, sheets: [sheet] };
    });
  }

  async get(auth: AuthContext, workbookId: string) {
    const workbook = await repo.findWorkbook(this.db, auth.organizationId, workbookId);
    if (!workbook) throw notFound('Workbook');
    return { ...workbook, sheets: await repo.listSheets(this.db, workbookId) };
  }

  async listCells(auth: AuthContext, workbookId: string, sheetId: string, window: repo.CellWindow) {
    const workbook = await this.get(auth, workbookId);
    if (!workbook.sheets.some((s) => s.id === sheetId)) throw notFound('Sheet');
    const cells = await repo.listCells(this.db, sheetId, window);
    return { revision: workbook.revision, cells };
  }

  /** Adds a sheet; formulas that already referenced its name are rebound and recalculated. */
  async addSheet(
    auth: AuthContext,
    workbookId: string,
    input: CreateSheetInput,
    requestId: string,
  ) {
    return this.commit(auth, workbookId, null, async (tx, engine, sheets, revision) => {
      if (sheets.some((s) => s.name.toLowerCase() === input.name.toLowerCase())) {
        throw new AppError('CONFLICT', `A sheet named '${input.name}' already exists`);
      }
      const position = sheets.reduce((max, s) => Math.max(max, s.position + 1), 0);
      const sheet = await repo.insertSheet(tx, workbookId, input.name, position);
      const result = engine.addSheet({ id: sheet.id, name: sheet.name });
      await recordAuditEvent(tx, {
        organizationId: auth.organizationId,
        actorUserId: auth.userId,
        action: 'sheet.created',
        targetType: 'sheet',
        targetId: sheet.id,
        metadata: { workbookId, name: sheet.name },
        requestId,
      });
      return {
        result,
        kind: 'sheet.created' as const,
        editCount: 0,
        payload: { sheetId: sheet.id, name: sheet.name, revision },
        extra: { sheet },
      };
    });
  }

  /** Applies a batch of cell edits under optimistic concurrency (baseRevision must be current). */
  async patchCells(auth: AuthContext, workbookId: string, input: PatchCellsInput) {
    return this.commit(auth, workbookId, input.baseRevision, async (_tx, engine, sheets) => {
      const sheetIds = new Set(sheets.map((s) => s.id));
      const unknown = input.edits.find((e) => !sheetIds.has(e.sheetId));
      if (unknown) {
        throw new AppError('VALIDATION_FAILED', 'Edit targets a sheet outside this workbook', {
          sheetId: unknown.sheetId,
        });
      }
      const result = engine.applyEdits(input.edits);
      if (engine.stats().cells > this.config.MAX_CELLS_PER_WORKBOOK) {
        throw new AppError(
          'PAYLOAD_TOO_LARGE',
          `Workbooks are limited to ${this.config.MAX_CELLS_PER_WORKBOOK} non-empty cells`,
        );
      }
      return {
        result,
        kind: 'cells' as const,
        editCount: input.edits.length,
        payload: {
          edits: input.edits.map(({ sheetId, row, col, raw }) => ({ sheetId, row, col, raw })),
        },
        extra: {},
      };
    });
  }

  /**
   * The single write pipeline: lock workbook row -> check revision -> get/build engine ->
   * mutate engine -> persist changed cells -> bump revision -> append revision log -> commit.
   * If anything fails after the engine was touched, the cached engine is discarded.
   */
  private async commit<E extends object>(
    auth: AuthContext,
    workbookId: string,
    baseRevision: number | null,
    work: (
      tx: PoolClient,
      engine: RecalcEngine,
      sheets: repo.SheetRow[],
      revision: number,
    ) => Promise<{
      result: {
        changed: readonly ComputedCell[];
        evaluated: number;
        cycles: readonly ComputedCell[];
      };
      kind: 'cells' | 'sheet.created';
      editCount: number;
      payload: unknown;
      extra: E;
    }>,
  ): Promise<CommitResult & E> {
    let engineTouched = false;
    try {
      const outcome = await withTransaction(this.db, async (tx) => {
        const workbook = await repo.lockWorkbook(tx, auth.organizationId, workbookId);
        if (!workbook) throw notFound('Workbook');
        if (baseRevision !== null && workbook.revision !== baseRevision) {
          throw new AppError('REVISION_CONFLICT', 'The workbook changed since you loaded it', {
            currentRevision: workbook.revision,
          });
        }
        const sheets = await repo.listSheets(tx, workbookId);
        const engine = await this.engineFor(tx, workbookId, workbook.revision, sheets);
        engineTouched = true;
        const done = await work(tx, engine, sheets, workbook.revision);
        const revision = workbook.revision + 1;
        await repo.persistCells(tx, workbookId, revision, done.result.changed);
        await repo.bumpRevision(tx, workbookId, revision);
        await repo.insertRevision(tx, {
          workbookId,
          revision,
          actorUserId: auth.userId,
          kind: done.kind,
          editCount: done.editCount,
          recalculated: done.result.evaluated,
          payload: done.payload,
        });
        return { engine, revision, done };
      });
      this.cache.set(workbookId, outcome.revision, outcome.engine);
      return {
        revision: outcome.revision,
        changed: outcome.done.result.changed.map(presentCell),
        evaluated: outcome.done.result.evaluated,
        cycles: outcome.done.result.cycles.length,
        ...outcome.done.extra,
      };
    } catch (error) {
      if (engineTouched) this.cache.invalidate(workbookId);
      throw error;
    }
  }

  private async engineFor(
    tx: PoolClient,
    workbookId: string,
    revision: number,
    sheets: repo.SheetRow[],
  ): Promise<RecalcEngine> {
    const cached = this.cache.get(workbookId, revision);
    if (cached) return cached;
    const cells = await repo.loadWorkbookCells(tx, workbookId);
    return RecalcEngine.create(
      sheets.map((s) => ({ id: s.id, name: s.name })),
      cells,
    );
  }
}

export function presentCell(cell: ComputedCell): CellDto {
  return {
    sheetId: cell.sheetId,
    row: cell.row,
    col: cell.col,
    raw: cell.raw,
    value: toCellValueDto(cell.value),
  };
}
