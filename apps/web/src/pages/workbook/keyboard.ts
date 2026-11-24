/** Pure keyboard-navigation rules for the grid (unit tested independently of React). */
export interface Position {
  readonly row: number;
  readonly col: number;
}

export interface Bounds {
  readonly rows: number;
  readonly cols: number;
}

const clamp = (n: number, max: number) => Math.min(Math.max(n, 0), max - 1);

export function move(position: Position, dRow: number, dCol: number, bounds: Bounds): Position {
  return {
    row: clamp(position.row + dRow, bounds.rows),
    col: clamp(position.col + dCol, bounds.cols),
  };
}

export type GridAction =
  | { readonly type: 'move'; readonly to: Position }
  | { readonly type: 'edit'; readonly initial: string | null }
  | { readonly type: 'clear' }
  | { readonly type: 'none' };

/** Maps a key press (while not editing) to a grid action. */
export function actionForKey(
  key: string,
  modifiers: { readonly shift: boolean; readonly ctrl: boolean },
  position: Position,
  bounds: Bounds,
  pageRows = 20,
): GridAction {
  const go = (dRow: number, dCol: number): GridAction => ({
    type: 'move',
    to: move(position, dRow, dCol, bounds),
  });
  switch (key) {
    case 'ArrowUp':
      return modifiers.ctrl ? { type: 'move', to: { row: 0, col: position.col } } : go(-1, 0);
    case 'ArrowDown':
      return modifiers.ctrl
        ? { type: 'move', to: { row: bounds.rows - 1, col: position.col } }
        : go(1, 0);
    case 'ArrowLeft':
      return modifiers.ctrl ? { type: 'move', to: { row: position.row, col: 0 } } : go(0, -1);
    case 'ArrowRight':
      return modifiers.ctrl
        ? { type: 'move', to: { row: position.row, col: bounds.cols - 1 } }
        : go(0, 1);
    case 'Tab':
      return go(0, modifiers.shift ? -1 : 1);
    case 'PageDown':
      return go(pageRows, 0);
    case 'PageUp':
      return go(-pageRows, 0);
    case 'Home':
      return {
        type: 'move',
        to: modifiers.ctrl ? { row: 0, col: 0 } : { row: position.row, col: 0 },
      };
    case 'Enter':
    case 'F2':
      return { type: 'edit', initial: null };
    case 'Delete':
    case 'Backspace':
      return { type: 'clear' };
    default:
      if (key.length === 1 && !modifiers.ctrl) return { type: 'edit', initial: key };
      return { type: 'none' };
  }
}
