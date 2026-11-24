import type { CellDto } from '@gridcalc/shared';
import { apiRequest } from '../../api/client';

export interface SheetInfo {
  readonly id: string;
  readonly name: string;
  readonly position: number;
  readonly rowCount: number;
  readonly colCount: number;
}

export interface WorkbookDetail {
  readonly id: string;
  readonly name: string;
  readonly revision: number;
  readonly sheets: readonly SheetInfo[];
}

export interface CommitResponse {
  readonly revision: number;
  readonly changed: readonly CellDto[];
  readonly evaluated: number;
  readonly cycles: number;
}

export const getWorkbook = async (id: string) =>
  (await apiRequest<WorkbookDetail>('GET', `/api/v1/workbooks/${id}`)).data;

export async function getSheetCells(
  workbookId: string,
  sheetId: string,
): Promise<{ cells: CellDto[]; revision: number }> {
  const result = await apiRequest<CellDto[]>(
    'GET',
    `/api/v1/workbooks/${workbookId}/sheets/${sheetId}/cells`,
  );
  return { cells: result.data, revision: Number(result.meta?.revision ?? 0) };
}

export const patchCells = async (
  workbookId: string,
  baseRevision: number,
  edits: { sheetId: string; row: number; col: number; raw: string }[],
) =>
  (
    await apiRequest<CommitResponse>('PATCH', `/api/v1/workbooks/${workbookId}/cells`, {
      baseRevision,
      edits,
    })
  ).data;

export const addSheet = async (workbookId: string, name: string) =>
  (
    await apiRequest<CommitResponse & { sheet: SheetInfo }>(
      'POST',
      `/api/v1/workbooks/${workbookId}/sheets`,
      { name },
    )
  ).data;
