import type { RecalcEngine } from '@gridcalc/shared';

/**
 * Bounded LRU of warm recalculation engines keyed by workbook id (ADR-0008).
 *
 * An entry is only valid for the exact workbook revision it was built at. Every write
 * path holds the workbook row lock (SELECT ... FOR UPDATE) while it uses the engine, so a
 * cached engine is never mutated concurrently, and a stale entry (another API instance
 * committed a newer revision) is detected by the revision check and rebuilt from Postgres.
 */
interface Entry {
  readonly revision: number;
  readonly engine: RecalcEngine;
}

export class EngineCache {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly capacity: number) {}

  get(workbookId: string, revision: number): RecalcEngine | null {
    const entry = this.entries.get(workbookId);
    if (!entry) return null;
    if (entry.revision !== revision) {
      this.entries.delete(workbookId);
      return null;
    }
    // Refresh recency: Map preserves insertion order.
    this.entries.delete(workbookId);
    this.entries.set(workbookId, entry);
    return entry.engine;
  }

  set(workbookId: string, revision: number, engine: RecalcEngine): void {
    if (this.capacity === 0) return;
    this.entries.delete(workbookId);
    this.entries.set(workbookId, { revision, engine });
    while (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next().value as string;
      this.entries.delete(oldest);
    }
  }

  invalidate(workbookId: string): void {
    this.entries.delete(workbookId);
  }

  get size(): number {
    return this.entries.size;
  }
}
