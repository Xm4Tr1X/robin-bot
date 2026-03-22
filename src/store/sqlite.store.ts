// NOTE: SqliteStore requires Node.js >= 22. The `node:sqlite` module is a
// built-in only available from Node 22 onwards.
import { DatabaseSync } from 'node:sqlite';
import type { DurableStore, StoreRecord, QueryOptions } from './store.contract';

export class SqliteStore implements DurableStore {
  private db: DatabaseSync;
  private knownTables = new Set<string>();

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
  }

  private ensureTable(name: string): void {
    if (this.knownTables.has(name)) return;
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS "${name}" (id TEXT PRIMARY KEY, data TEXT)`,
    );
    this.knownTables.add(name);
  }

  get<T extends StoreRecord>(table: string, id: string): T | undefined {
    this.ensureTable(table);
    const stmt = this.db.prepare(`SELECT data FROM "${table}" WHERE id = ?`);
    const row = stmt.get(id) as { data: string } | undefined;
    if (!row) return undefined;
    return JSON.parse(row.data) as T;
  }

  list<T extends StoreRecord>(table: string, opts?: QueryOptions): T[] {
    this.ensureTable(table);
    const stmt = this.db.prepare(`SELECT data FROM "${table}"`);
    const rows = stmt.all() as { data: string }[];
    let records = rows.map((r) => JSON.parse(r.data) as T);

    // Apply where filter — all keys must match
    if (opts?.where) {
      const where = opts.where;
      records = records.filter((r) =>
        Object.entries(where).every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v),
      );
    }

    // Apply orderBy — string comparison (works correctly for ISO dates)
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
    this.ensureTable(table);
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO "${table}" (id, data) VALUES (?, ?)`,
    );
    stmt.run(record.id, JSON.stringify(record));
  }

  delete(table: string, id: string): boolean {
    this.ensureTable(table);
    const stmt = this.db.prepare(`DELETE FROM "${table}" WHERE id = ?`);
    const result = stmt.run(id);
    return (result.changes as number) > 0;
  }

  deleteWhere(table: string, where: Record<string, unknown>): number {
    this.ensureTable(table);
    // Select all, filter in memory, delete matching ids
    const stmt = this.db.prepare(`SELECT data FROM "${table}"`);
    const rows = stmt.all() as { data: string }[];
    const records = rows.map((r) => JSON.parse(r.data) as StoreRecord);

    const toDelete = records
      .filter((r) => Object.entries(where).every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v))
      .map((r) => r.id);

    if (toDelete.length === 0) return 0;

    const delStmt = this.db.prepare(`DELETE FROM "${table}" WHERE id = ?`);
    for (const id of toDelete) {
      delStmt.run(id);
    }

    return toDelete.length;
  }

  close(): void {
    this.db.close();
  }
}
