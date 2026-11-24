import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiRequestError } from '../../api/client';
import { can, useAuth } from '../../auth/session';
import { cellKeyOf } from './cell-display';
import { applyChanges, sheetFromList, type CellStore } from './cell-store';
import { FormulaBar } from './FormulaBar';
import { Grid } from './Grid';
import { move, type Position } from './keyboard';
import { SheetTabs } from './SheetTabs';
import {
  addSheet,
  getSheetCells,
  getWorkbook,
  patchCells,
  type WorkbookDetail,
} from './workbook.api';

const EMPTY_MAP = new Map();

export function WorkbookPage() {
  const { workbookId = '' } = useParams();
  const { session } = useAuth();
  const readOnly = !can(session, 'workbook:write');
  const [workbook, setWorkbook] = useState<WorkbookDetail | null>(null);
  const [activeSheet, setActiveSheet] = useState<string>('');
  const [store, setStore] = useState<CellStore>(new Map());
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<Position>({ row: 0, col: 0 });
  const [draft, setDraft] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSheet = useCallback(
    async (sheetId: string) => {
      const { cells, revision: rev } = await getSheetCells(workbookId, sheetId);
      setStore((prev) => new Map(prev).set(sheetId, sheetFromList(cells)));
      setRevision(rev);
    },
    [workbookId],
  );

  useEffect(() => {
    getWorkbook(workbookId)
      .then(async (wb) => {
        setWorkbook(wb);
        const first = wb.sheets[0];
        if (first) {
          setActiveSheet(first.id);
          await loadSheet(first.id);
        }
      })
      .catch((err: unknown) =>
        setError(err instanceof ApiRequestError ? err.message : 'Could not open the workbook.'),
      );
  }, [workbookId, loadSheet]);

  const sheet = workbook?.sheets.find((s) => s.id === activeSheet);
  const cells = store.get(activeSheet) ?? EMPTY_MAP;
  const selectedCell = cells.get(cellKeyOf(selected.row, selected.col));
  const bounds = { rows: sheet?.rowCount ?? 1, cols: sheet?.colCount ?? 1 };

  const commitRaw = async (raw: string) => {
    if ((selectedCell?.raw ?? '') === raw) return;
    setStatus('Saving…');
    try {
      const result = await patchCells(workbookId, revision, [
        { sheetId: activeSheet, row: selected.row, col: selected.col, raw },
      ]);
      setStore((prev) => applyChanges(prev, result.changed));
      setRevision(result.revision);
      setStatus(
        `Saved · ${result.evaluated} formula${result.evaluated === 1 ? '' : 's'} recalculated${result.cycles ? ` · ${result.cycles} in a circular reference` : ''}`,
      );
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'REVISION_CONFLICT') {
        await loadSheet(activeSheet);
        setStatus('This workbook changed elsewhere. It was reloaded; please re-apply your edit.');
      } else {
        setStatus(err instanceof ApiRequestError ? err.message : 'Saving failed.');
      }
    }
  };

  const commit = (moveBy: { row: number; col: number }) => {
    if (draft === null) return;
    const raw = draft;
    setDraft(null);
    setSelected((pos) => move(pos, moveBy.row, moveBy.col, bounds));
    void commitRaw(raw);
  };

  const switchSheet = async (id: string) => {
    setDraft(null);
    setActiveSheet(id);
    setSelected({ row: 0, col: 0 });
    if (!store.has(id)) await loadSheet(id);
  };

  const onAddSheet = async () => {
    const name = window.prompt('Sheet name', `Sheet${(workbook?.sheets.length ?? 0) + 1}`);
    if (!name || !workbook) return;
    try {
      const result = await addSheet(workbookId, name);
      setWorkbook({
        ...workbook,
        revision: result.revision,
        sheets: [...workbook.sheets, result.sheet],
      });
      setStore((prev) =>
        applyChanges(new Map(prev).set(result.sheet.id, new Map()), result.changed),
      );
      setRevision(result.revision);
      setActiveSheet(result.sheet.id);
    } catch (err) {
      setStatus(err instanceof ApiRequestError ? err.message : 'Could not add the sheet.');
    }
  };

  if (error) {
    return (
      <section className="page">
        <p className="form-error" role="alert">
          {error}
        </p>
        <Link to="/workbooks">Back to workbooks</Link>
      </section>
    );
  }
  if (!workbook || !sheet)
    return (
      <p role="status" className="page">
        Loading workbook…
      </p>
    );

  return (
    <section className="workbook">
      <header className="workbook-header">
        <Link to="/workbooks" className="muted">
          Workbooks
        </Link>
        <h1>{workbook.name}</h1>
        {readOnly && <span className="badge">View only</span>}
        <span className="muted revision">rev {revision}</span>
      </header>
      <FormulaBar
        row={selected.row}
        col={selected.col}
        cell={selectedCell}
        draft={draft}
        readOnly={readOnly}
        onFocusEdit={() => setDraft(selectedCell?.raw ?? '')}
        onDraftChange={setDraft}
        onCommit={() => commit({ row: 1, col: 0 })}
        onCancel={() => setDraft(null)}
      />
      <Grid
        rowCount={sheet.rowCount}
        colCount={sheet.colCount}
        cells={cells}
        selected={selected}
        draft={draft}
        readOnly={readOnly}
        onSelect={(pos) => {
          if (draft !== null) commit({ row: 0, col: 0 });
          setSelected(pos);
        }}
        onStartEdit={(initial) => setDraft(initial ?? selectedCell?.raw ?? '')}
        onDraftChange={setDraft}
        onCommit={commit}
        onCancel={() => setDraft(null)}
        onClear={() => void commitRaw('')}
      />
      <footer className="workbook-footer">
        <SheetTabs
          sheets={workbook.sheets}
          activeId={activeSheet}
          canAdd={!readOnly}
          onSelect={(id) => void switchSheet(id)}
          onAdd={() => void onAddSheet()}
        />
        <span className="status" role="status" aria-live="polite">
          {status}
        </span>
      </footer>
    </section>
  );
}
