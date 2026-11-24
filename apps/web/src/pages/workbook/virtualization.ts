/**
 * Windowing math for the virtualized grid. Only cells inside the viewport (plus an
 * overscan margin) are rendered, so DOM size is O(visible cells) regardless of whether the
 * sheet has 1,000 or 1,000,000 rows.
 */
export interface Span {
  readonly start: number;
  readonly end: number; // inclusive
}

export function visibleSpan(
  scroll: number,
  viewport: number,
  itemSize: number,
  count: number,
  overscan = 3,
): Span {
  if (count <= 0 || itemSize <= 0) return { start: 0, end: -1 };
  const first = Math.min(count - 1, Math.floor(Math.max(0, scroll) / itemSize));
  const visible = Math.ceil(Math.max(0, viewport) / itemSize) + 1;
  const start = Math.max(0, first - overscan);
  const end = Math.min(count - 1, first + visible + overscan);
  return { start, end: Math.max(start, end) };
}

export interface GridMetrics {
  readonly rowHeight: number;
  readonly colWidth: number;
  readonly headerHeight: number;
  readonly headerWidth: number;
}

export const DEFAULT_METRICS: GridMetrics = {
  rowHeight: 24,
  colWidth: 104,
  headerHeight: 26,
  headerWidth: 56,
};

/** Scroll offset needed so the given cell is fully visible (null when no scroll is needed). */
export function scrollIntoView(
  index: number,
  itemSize: number,
  scroll: number,
  viewport: number,
): number | null {
  const top = index * itemSize;
  const bottom = top + itemSize;
  if (top < scroll) return top;
  if (bottom > scroll + viewport) return bottom - viewport;
  return null;
}
