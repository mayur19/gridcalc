import type { CellDto } from '@gridcalc/shared';
import { indexToColumn } from '@gridcalc/shared';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type UIEvent } from 'react';
import { cellAlignment, cellKeyOf, displayValue } from './cell-display';
import { actionForKey, move, type Position } from './keyboard';
import { DEFAULT_METRICS, scrollIntoView, visibleSpan } from './virtualization';

export interface GridProps {
  readonly rowCount: number;
  readonly colCount: number;
  readonly cells: ReadonlyMap<string, CellDto>;
  readonly selected: Position;
  readonly draft: string | null;
  readonly readOnly: boolean;
  readonly onSelect: (position: Position) => void;
  readonly onStartEdit: (initial: string | null) => void;
  readonly onDraftChange: (value: string) => void;
  readonly onCommit: (moveBy: { row: number; col: number }) => void;
  readonly onCancel: () => void;
  readonly onClear: () => void;
  /** Initial viewport size; replaced by the measured size once mounted (tests use the default). */
  readonly initialViewport?: { readonly width: number; readonly height: number };
}

const m = DEFAULT_METRICS;

export function Grid(props: GridProps) {
  const { rowCount, colCount, cells, selected, draft, readOnly } = props;
  const scroller = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState({ top: 0, left: 0 });
  const [viewport, setViewport] = useState(props.initialViewport ?? { width: 960, height: 540 });

  useEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Keep the selected cell visible when it moves via the keyboard.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const top = scrollIntoView(
      selected.row,
      m.rowHeight,
      el.scrollTop,
      viewport.height - m.headerHeight,
    );
    const left = scrollIntoView(
      selected.col,
      m.colWidth,
      el.scrollLeft,
      viewport.width - m.headerWidth,
    );
    if (top !== null) el.scrollTop = top;
    if (left !== null) el.scrollLeft = left;
  }, [selected, viewport]);

  const onScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    setScroll({ top: el.scrollTop, left: el.scrollLeft });
  }, []);

  const rows = visibleSpan(scroll.top, viewport.height - m.headerHeight, m.rowHeight, rowCount);
  const cols = visibleSpan(scroll.left, viewport.width - m.headerWidth, m.colWidth, colCount);
  const bounds = { rows: rowCount, cols: colCount };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (draft !== null) return; // the editor input handles its own keys
    const action = actionForKey(
      event.key,
      { shift: event.shiftKey, ctrl: event.ctrlKey || event.metaKey },
      selected,
      bounds,
    );
    if (action.type === 'none') return;
    event.preventDefault();
    if (action.type === 'move') props.onSelect(action.to);
    else if (readOnly) return;
    else if (action.type === 'edit') props.onStartEdit(action.initial);
    else props.onClear();
  };

  const onEditorKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      props.onCommit({ row: event.shiftKey ? -1 : 1, col: 0 });
      scroller.current?.focus();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      props.onCommit({ row: 0, col: event.shiftKey ? -1 : 1 });
      scroller.current?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      props.onCancel();
      scroller.current?.focus();
    }
  };

  const cellsOut = [];
  for (let r = rows.start; r <= rows.end; r += 1) {
    for (let c = cols.start; c <= cols.end; c += 1) {
      const cell = cells.get(cellKeyOf(r, c));
      const isSelected = r === selected.row && c === selected.col;
      const isError = cell?.value.type === 'error';
      cellsOut.push(
        <div
          key={`${r}:${c}`}
          role="gridcell"
          aria-selected={isSelected}
          data-cell={`${indexToColumn(c)}${r + 1}`}
          className={`cell${isSelected ? ' selected' : ''}${isError ? ' error' : ''}`}
          title={
            cell?.value.type === 'error' ? (cell.value.message ?? cell.value.value) : undefined
          }
          style={{
            top: m.headerHeight + r * m.rowHeight,
            left: m.headerWidth + c * m.colWidth,
            width: m.colWidth,
            height: m.rowHeight,
            textAlign: cellAlignment(cell?.value),
          }}
          onMouseDown={() => props.onSelect({ row: r, col: c })}
          onDoubleClick={() => !readOnly && props.onStartEdit(null)}
        >
          {displayValue(cell?.value)}
        </div>,
      );
    }
  }

  const colHeaders = [];
  for (let c = cols.start; c <= cols.end; c += 1) {
    colHeaders.push(
      <div
        key={c}
        role="columnheader"
        className={`col-header${c === selected.col ? ' active' : ''}`}
        style={{
          left: m.headerWidth + c * m.colWidth,
          top: scroll.top,
          width: m.colWidth,
          height: m.headerHeight,
        }}
      >
        {indexToColumn(c)}
      </div>,
    );
  }
  const rowHeaders = [];
  for (let r = rows.start; r <= rows.end; r += 1) {
    rowHeaders.push(
      <div
        key={r}
        role="rowheader"
        className={`row-header${r === selected.row ? ' active' : ''}`}
        style={{
          top: m.headerHeight + r * m.rowHeight,
          left: scroll.left,
          width: m.headerWidth,
          height: m.rowHeight,
        }}
      >
        {r + 1}
      </div>,
    );
  }

  return (
    <div
      ref={scroller}
      className="grid-scroller"
      role="grid"
      aria-rowcount={rowCount}
      aria-colcount={colCount}
      aria-label="Sheet cells"
      tabIndex={0}
      onScroll={onScroll}
      onKeyDown={onKeyDown}
    >
      <div
        className="grid-canvas"
        style={{
          width: m.headerWidth + colCount * m.colWidth,
          height: m.headerHeight + rowCount * m.rowHeight,
        }}
      >
        {cellsOut}
        {draft !== null && (
          <input
            className="cell-editor"
            aria-label="Cell editor"
            autoFocus
            value={draft}
            onChange={(e) => props.onDraftChange(e.target.value)}
            onKeyDown={onEditorKey}
            onBlur={() => props.onCommit({ row: 0, col: 0 })}
            style={{
              top: m.headerHeight + selected.row * m.rowHeight,
              left: m.headerWidth + selected.col * m.colWidth,
              width: Math.max(m.colWidth, (draft.length + 2) * 8),
              height: m.rowHeight,
            }}
          />
        )}
        {colHeaders}
        {rowHeaders}
        <div
          className="corner"
          style={{
            top: scroll.top,
            left: scroll.left,
            width: m.headerWidth,
            height: m.headerHeight,
          }}
        />
      </div>
    </div>
  );
}

export { move };
