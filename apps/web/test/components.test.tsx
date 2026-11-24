import type { CellDto } from '@gridcalc/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { FormulaBar } from '../src/pages/workbook/FormulaBar';
import { Grid, type GridProps } from '../src/pages/workbook/Grid';
import { SheetTabs } from '../src/pages/workbook/SheetTabs';
import { PendingPage } from '../src/pages/PendingPage';
import { NAV_ITEMS } from '../src/routes/navigation';

const cell = (row: number, col: number, raw: string, value: CellDto['value']): CellDto => ({
  sheetId: 's',
  row,
  col,
  raw,
  value,
});

function renderGrid(overrides: Partial<GridProps> = {}) {
  const props: GridProps = {
    rowCount: 100_000,
    colCount: 52,
    cells: new Map([
      ['0:0', cell(0, 0, '10', { type: 'number', value: 10 })],
      [
        '1:0',
        cell(1, 0, '=A1/0', { type: 'error', value: '#DIV/0!', message: 'Division by zero' }),
      ],
    ]),
    selected: { row: 0, col: 0 },
    draft: null,
    readOnly: false,
    onSelect: vi.fn(),
    onStartEdit: vi.fn(),
    onDraftChange: vi.fn(),
    onCommit: vi.fn(),
    onCancel: vi.fn(),
    onClear: vi.fn(),
    initialViewport: { width: 600, height: 300 },
    ...overrides,
  };
  render(<Grid {...props} />);
  return props;
}

describe('Grid', () => {
  it('virtualizes: renders only the visible window of a 100k-row sheet', () => {
    renderGrid();
    const rendered = screen.getAllByRole('gridcell');
    expect(rendered.length).toBeLessThan(200);
    expect(screen.getByRole('grid')).toHaveAttribute('aria-rowcount', '100000');
    expect(document.querySelector('[data-cell="A1"]')).toHaveTextContent('10');
    expect(document.querySelector('[data-cell="A2"]')).toHaveClass('error');
    expect(document.querySelector('[data-cell="A1000"]')).toBeNull();
  });

  it('maps keys to selection, editing and clearing', () => {
    const props = renderGrid();
    const grid = screen.getByRole('grid');
    fireEvent.keyDown(grid, { key: 'ArrowDown' });
    expect(props.onSelect).toHaveBeenCalledWith({ row: 1, col: 0 });
    fireEvent.keyDown(grid, { key: '=' });
    expect(props.onStartEdit).toHaveBeenCalledWith('=');
    fireEvent.keyDown(grid, { key: 'Delete' });
    expect(props.onClear).toHaveBeenCalled();
    fireEvent.keyDown(grid, { key: 'Shift' });
    fireEvent.mouseDown(document.querySelector('[data-cell="B3"]')!);
    expect(props.onSelect).toHaveBeenCalledWith({ row: 2, col: 1 });
    fireEvent.doubleClick(document.querySelector('[data-cell="B3"]')!);
    expect(props.onStartEdit).toHaveBeenCalledWith(null);
  });

  it('does not edit in read-only mode', () => {
    const props = renderGrid({ readOnly: true });
    fireEvent.keyDown(screen.getByRole('grid'), { key: 'x' });
    expect(props.onStartEdit).not.toHaveBeenCalled();
  });

  it('commits and cancels from the inline editor', () => {
    const props = renderGrid({ draft: '=A1*2' });
    const editor = screen.getByLabelText('Cell editor');
    fireEvent.change(editor, { target: { value: '=A1*3' } });
    expect(props.onDraftChange).toHaveBeenCalledWith('=A1*3');
    fireEvent.keyDown(editor, { key: 'Enter' });
    expect(props.onCommit).toHaveBeenCalledWith({ row: 1, col: 0 });
    fireEvent.keyDown(editor, { key: 'Tab' });
    expect(props.onCommit).toHaveBeenCalledWith({ row: 0, col: 1 });
    fireEvent.keyDown(editor, { key: 'Escape' });
    expect(props.onCancel).toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('grid'), { key: 'ArrowDown' });
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it('re-renders a different window after scrolling', () => {
    renderGrid();
    const grid = screen.getByRole('grid');
    grid.scrollTop = 24 * 5000;
    fireEvent.scroll(grid);
    expect(document.querySelector('[data-cell="A5001"]')).not.toBeNull();
    expect(document.querySelector('[data-cell="A1"]')).toBeNull();
  });
});

describe('FormulaBar', () => {
  it('shows the raw formula and error details, and commits on Enter', () => {
    const onCommit = vi.fn();
    const onCancel = vi.fn();
    const onFocusEdit = vi.fn();
    render(
      <FormulaBar
        row={1}
        col={0}
        cell={cell(1, 0, '=A1/0', { type: 'error', value: '#DIV/0!', message: 'Division by zero' })}
        draft={null}
        readOnly={false}
        onFocusEdit={onFocusEdit}
        onDraftChange={vi.fn()}
        onCommit={onCommit}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByLabelText('Selected cell')).toHaveTextContent('A2');
    const input = screen.getByLabelText('Formula bar');
    expect(input).toHaveValue('=A1/0');
    expect(screen.getByRole('note')).toHaveTextContent('#DIV/0!: Division by zero');
    fireEvent.focus(input);
    expect(onFocusEdit).toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });
});

describe('SheetTabs and PendingPage', () => {
  it('selects and adds sheets', () => {
    const onSelect = vi.fn();
    const onAdd = vi.fn();
    render(
      <SheetTabs
        sheets={[
          { id: 'a', name: 'Budget' },
          { id: 'b', name: 'Limits' },
        ]}
        activeId="a"
        canAdd
        onSelect={onSelect}
        onAdd={onAdd}
      />,
    );
    expect(screen.getByRole('tab', { name: 'Budget' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: 'Limits' }));
    expect(onSelect).toHaveBeenCalledWith('b');
    fireEvent.click(screen.getByLabelText('Add sheet'));
    expect(onAdd).toHaveBeenCalled();
  });

  it('renders planned sections with their ticket', () => {
    const item = NAV_ITEMS.find((i) => i.path === '/pivots')!;
    render(
      <MemoryRouter>
        <PendingPage item={item} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: /Pivot tables/ })).toBeInTheDocument();
    expect(screen.getByText('GC-077')).toBeInTheDocument();
  });
});
