import { formatGeneral, indexToColumn, type CellValueDto } from '@gridcalc/shared';

export function displayValue(value: CellValueDto | undefined): string {
  if (!value) return '';
  switch (value.type) {
    case 'empty':
      return '';
    case 'number':
      return formatGeneral(value.value);
    case 'boolean':
      return value.value ? 'TRUE' : 'FALSE';
    default:
      return String(value.value);
  }
}

export function cellAlignment(value: CellValueDto | undefined): 'left' | 'right' | 'center' {
  if (!value) return 'left';
  if (value.type === 'number') return 'right';
  if (value.type === 'boolean' || value.type === 'error') return 'center';
  return 'left';
}

export function cellName(row: number, col: number): string {
  return `${indexToColumn(col)}${row + 1}`;
}

export const cellKeyOf = (row: number, col: number): string => `${row}:${col}`;
