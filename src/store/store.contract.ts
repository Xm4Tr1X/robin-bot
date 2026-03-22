export interface StoreRecord {
  id: string;
}

export interface QueryOptions {
  limit?: number;
  offset?: number;
  where?: Record<string, unknown>;
  orderBy?: { field: string; dir: 'asc' | 'desc' };
}

export interface DurableStore {
  get<T extends StoreRecord>(table: string, id: string): T | undefined;
  list<T extends StoreRecord>(table: string, opts?: QueryOptions): T[];
  upsert<T extends StoreRecord>(table: string, record: T): void;
  delete(table: string, id: string): boolean;
  deleteWhere(table: string, where: Record<string, unknown>): number;
  close(): void;
}
