import { isError, type ErrorCode, type Scalar } from '../formula/values.js';

/** Wire format of a computed cell value. Errors travel as their code plus an optional message. */
export type CellValueDto =
  | { readonly type: 'empty'; readonly value: null }
  | { readonly type: 'number'; readonly value: number }
  | { readonly type: 'string'; readonly value: string }
  | { readonly type: 'boolean'; readonly value: boolean }
  | { readonly type: 'error'; readonly value: ErrorCode; readonly message?: string };

export function toCellValueDto(value: Scalar): CellValueDto {
  if (value === null) return { type: 'empty', value: null };
  if (isError(value)) {
    return value.message === undefined
      ? { type: 'error', value: value.code }
      : { type: 'error', value: value.code, message: value.message };
  }
  switch (typeof value) {
    case 'number':
      return { type: 'number', value };
    case 'string':
      return { type: 'string', value };
    default:
      return { type: 'boolean', value };
  }
}

export interface CellDto {
  readonly sheetId: string;
  readonly row: number;
  readonly col: number;
  readonly raw: string;
  readonly value: CellValueDto;
}
