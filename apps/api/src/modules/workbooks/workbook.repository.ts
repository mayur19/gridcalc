import type { CellDto, CellValueDto, ComputedCell } from '@gridcalc/shared';
import { toCellValueDto } from '@gridcalc/shared';
import type { Queryable } from '../../db/pool.js';

/** Every query is scoped by organization_id (tenant isolation, ADR-0005). */
export interface WorkbookRow {
  readonly id: string;
  readonly name: string;
  readonly revision: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface SheetRow {
  readonly id: string;
  readonly name: string;
  readonly position: number;
  readonly rowCount: number;
  readonly colCount: number;
}

const WORKBOOK_COLUMNS = `id, name, revision, created_at AS "createdAt", updated_at AS "updatedAt"`;
const SHEET_COLUMNS = `id, name, position, row_count AS "rowCount", col_count AS "colCount"`;

export async function listWorkbooks(
  db: Queryable,
  organizationId: string,
  limit: number,
  offset: number,
): Promise<{ rows: WorkbookRow[]; total: number }> {
  const [list, count] = await Promise.all([
    db.query<WorkbookRow>(
      `SELECT ${WORKBOOK_COLUMNS} FROM workbooks
        WHERE organization_id = $1 AND deleted_at IS NULL
        ORDER BY updated_at DESC, id LIMIT $2 OFFSET $3`,
      [organizationId, limit, offset],
    ),
    db.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM workbooks WHERE organization_id = $1 AND deleted_at IS NULL`,
      [organizationId],
    ),
  ]);
  return { rows: list.rows, total: count.rows[0]?.total ?? 0 };
}

export async function insertWorkbook(
  db: Queryable,
  organizationId: string,
  name: string,
  createdBy: string,
): Promise<WorkbookRow> {
  const { rows } = await db.query<WorkbookRow>(
    `INSERT INTO workbooks (organization_id, name, created_by, revision) VALUES ($1, $2, $3, 1)
     RETURNING ${WORKBOOK_COLUMNS}`,
    [organizationId, name, createdBy],
  );
  return rows[0]!;
}

export async function findWorkbook(
  db: Queryable,
  organizationId: string,
  id: string,
): Promise<WorkbookRow | null> {
  const { rows } = await db.query<WorkbookRow>(
    `SELECT ${WORKBOOK_COLUMNS} FROM workbooks WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [id, organizationId],
  );
  return rows[0] ?? null;
}

/** Locks the workbook row for the rest of the transaction: the single-writer gate (ADR-0007). */
export async function lockWorkbook(
  db: Queryable,
  organizationId: string,
  id: string,
): Promise<WorkbookRow | null> {
  const { rows } = await db.query<WorkbookRow>(
    `SELECT ${WORKBOOK_COLUMNS} FROM workbooks
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL FOR UPDATE`,
    [id, organizationId],
  );
  return rows[0] ?? null;
}

export async function bumpRevision(db: Queryable, id: string, revision: number): Promise<Date> {
  const { rows } = await db.query<{ updatedAt: Date }>(
    `UPDATE workbooks SET revision = $2, updated_at = now() WHERE id = $1 RETURNING updated_at AS "updatedAt"`,
    [id, revision],
  );
  return rows[0]!.updatedAt;
}

export async function listSheets(db: Queryable, workbookId: string): Promise<SheetRow[]> {
  const { rows } = await db.query<SheetRow>(
    `SELECT ${SHEET_COLUMNS} FROM sheets WHERE workbook_id = $1 ORDER BY position`,
    [workbookId],
  );
  return rows;
}

export async function insertSheet(
  db: Queryable,
  workbookId: string,
  name: string,
  position: number,
): Promise<SheetRow> {
  const { rows } = await db.query<SheetRow>(
    `INSERT INTO sheets (workbook_id, name, position) VALUES ($1, $2, $3) RETURNING ${SHEET_COLUMNS}`,
    [workbookId, name, position],
  );
  return rows[0]!;
}

export interface CellWindow {
  readonly top: number;
  readonly left: number;
  readonly bottom: number;
  readonly right: number;
}

interface CellRow {
  readonly sheetId: string;
  readonly row: number;
  readonly col: number;
  readonly raw: string;
  readonly value: CellValueDto;
}

export async function listCells(
  db: Queryable,
  sheetId: string,
  window: CellWindow,
): Promise<CellDto[]> {
  const { rows } = await db.query<CellRow>(
    `SELECT sheet_id AS "sheetId", row_idx AS "row", col_idx AS "col", raw, value
       FROM cells
      WHERE sheet_id = $1 AND row_idx BETWEEN $2 AND $3 AND col_idx BETWEEN $4 AND $5
      ORDER BY row_idx, col_idx`,
    [sheetId, window.top, window.bottom, window.left, window.right],
  );
  return rows;
}

export async function loadWorkbookCells(
  db: Queryable,
  workbookId: string,
): Promise<{ sheetId: string; row: number; col: number; raw: string }[]> {
  const { rows } = await db.query<{ sheetId: string; row: number; col: number; raw: string }>(
    `SELECT sheet_id AS "sheetId", row_idx AS "row", col_idx AS "col", raw FROM cells WHERE workbook_id = $1`,
    [workbookId],
  );
  return rows;
}

/**
 * Persists engine output in two set-based statements (unnest arrays, no per-cell round trips):
 * upsert of non-empty cells and delete of cleared cells.
 */
export async function persistCells(
  db: Queryable,
  workbookId: string,
  revision: number,
  cells: readonly ComputedCell[],
): Promise<void> {
  const present = cells.filter((c) => c.raw !== '');
  const cleared = cells.filter((c) => c.raw === '');
  if (present.length > 0) {
    const values = present.map((c) => toCellValueDto(c.value));
    await db.query(
      `INSERT INTO cells (sheet_id, row_idx, col_idx, workbook_id, raw, value_type, value, updated_revision, updated_at)
       SELECT s, r, c, $1, raw, vt, v, $2, now()
         FROM unnest($3::uuid[], $4::int[], $5::int[], $6::text[], $7::text[], $8::jsonb[]) AS t(s, r, c, raw, vt, v)
       ON CONFLICT (sheet_id, row_idx, col_idx) DO UPDATE
         SET raw = EXCLUDED.raw, value_type = EXCLUDED.value_type, value = EXCLUDED.value,
             updated_revision = EXCLUDED.updated_revision, updated_at = EXCLUDED.updated_at`,
      [
        workbookId,
        revision,
        present.map((c) => c.sheetId),
        present.map((c) => c.row),
        present.map((c) => c.col),
        present.map((c) => c.raw),
        values.map((v) => v.type),
        values.map((v) => JSON.stringify(v)),
      ],
    );
  }
  if (cleared.length > 0) {
    await db.query(
      `DELETE FROM cells c USING unnest($1::uuid[], $2::int[], $3::int[]) AS t(s, r, col)
        WHERE c.sheet_id = t.s AND c.row_idx = t.r AND c.col_idx = t.col`,
      [cleared.map((c) => c.sheetId), cleared.map((c) => c.row), cleared.map((c) => c.col)],
    );
  }
}

export async function insertRevision(
  db: Queryable,
  entry: {
    workbookId: string;
    revision: number;
    actorUserId: string;
    kind: 'cells' | 'sheet.created' | 'workbook.created';
    editCount: number;
    recalculated: number;
    payload: unknown;
  },
): Promise<void> {
  await db.query(
    `INSERT INTO workbook_revisions (workbook_id, revision, actor_user_id, kind, edit_count, recalculated, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      entry.workbookId,
      entry.revision,
      entry.actorUserId,
      entry.kind,
      entry.editCount,
      entry.recalculated,
      JSON.stringify(entry.payload),
    ],
  );
}
