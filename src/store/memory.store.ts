import type { DurableStore, StoreRecord, QueryOptions } from './store.contract';

export class MemoryStore implements DurableStore {
  private tables = new Map<string, Map<string, StoreRecord>>();

  private getTable(table: string): Map<string, StoreRecord> {
    let t = this.tables.get(table);
    if (!t) {
      t = new Map<string, StoreRecord>();
      this.tables.set(table, t);
    }
    return t;
  }

  get<T extends StoreRecord>(table: string, id: string): T | undefined {
    const t = this.tables.get(table);
    if (!t) return undefined;
    return t.get(id) as T | undefined;
  }

  list<T extends StoreRecord>(table: string, opts?: QueryOptions): T[] {
    const t = this.tables.get(table);
    if (!t) return [];

    let records = Array.from(t.values()) as T[];

    // Apply where filter — all keys must match
    if (opts?.where) {
      const where = opts.where;
      records = records.filter((r) =>
        Object.entries(where).every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v),
      );
    }

    // Apply orderBy — string comparison works for ISO dates, numbers coerced to string
    if (opts?.orderBy) {
      const { field, dir } = opts.orderBy;
      records = records.slice().sort((a, b) => {
        const av = String((a as unknown as Record<string, unknown>)[field] ?? '');
        const bv = String((b as unknown as Record<string, unknown>)[field] ?? '');
        if (av < bv) return dir === 'asc' ? -1 : 1;
        if (av > bv) return dir === 'asc' ? 1 : -1;
        return 0;
      });
    }

    // Apply offset
    if (opts?.offset != null && opts.offset > 0) {
      records = records.slice(opts.offset);
    }

    // Apply limit
    if (opts?.limit != null) {
      records = records.slice(0, opts.limit);
    }

    return records;
  }

  upsert<T extends StoreRecord>(table: string, record: T): void {
    const t = this.getTable(table);
    t.set(record.id, record);
  }

  delete(table: string, id: string): boolean {
    const t = this.tables.get(table);
    if (!t) return false;
    return t.delete(id);
  }

  deleteWhere(table: string, where: Record<string, unknown>): number {
    const t = this.tables.get(table);
    if (!t) return 0;

    const toDelete: string[] = [];
    for (const [id, record] of t.entries()) {
      const matches = Object.entries(where).every(([k, v]) => (record as unknown as Record<string, unknown>)[k] === v);
      if (matches) toDelete.push(id);
    }

    for (const id of toDelete) {
      t.delete(id);
    }

    return toDelete.length;
  }

  close(): void {
    // no-op for in-memory store
  }
}
