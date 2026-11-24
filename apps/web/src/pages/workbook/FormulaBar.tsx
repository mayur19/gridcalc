import type { CellDto } from '@gridcalc/shared';
import type { KeyboardEvent } from 'react';
import { cellName } from './cell-display';

export interface FormulaBarProps {
  readonly row: number;
  readonly col: number;
  readonly cell: CellDto | undefined;
  readonly draft: string | null;
  readonly readOnly: boolean;
  readonly onFocusEdit: () => void;
  readonly onDraftChange: (value: string) => void;
  readonly onCommit: () => void;
  readonly onCancel: () => void;
}

/** Shows the raw content (formula text) of the selected cell and edits it. */
export function FormulaBar(props: FormulaBarProps) {
  const { row, col, cell, draft, readOnly } = props;
  const value = draft ?? cell?.raw ?? '';
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      props.onCommit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      props.onCancel();
    }
  };
  return (
    <div className="formula-bar">
      <span className="name-box" aria-label="Selected cell">
        {cellName(row, col)}
      </span>
      <span className="fx" aria-hidden="true">
        fx
      </span>
      <input
        aria-label="Formula bar"
        value={value}
        readOnly={readOnly}
        spellCheck={false}
        onFocus={() => draft === null && !readOnly && props.onFocusEdit()}
        onChange={(e) => props.onDraftChange(e.target.value)}
        onKeyDown={onKeyDown}
      />
      {cell?.value.type === 'error' && cell.value.message && (
        <span className="formula-error" role="note">
          {cell.value.value}: {cell.value.message}
        </span>
      )}
    </div>
  );
}
