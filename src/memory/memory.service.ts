import { randomUUID } from 'node:crypto';
import type { MemoryEntry } from '../contracts';
import type { DurableStore } from '../store/store.contract';

const MEMORY_TABLE = 'memory_entries';
const RETENTION_DAYS = 30;

export class MemoryService {
  constructor(private store: DurableStore) {}

  addGlobal(kind: MemoryEntry['kind'], content: string): MemoryEntry {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const entry: MemoryEntry = {
      id: randomUUID().slice(0, 8),
      scope: 'global',
      kind,
      content,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
    this.store.upsert(MEMORY_TABLE, entry);
    return entry;
  }

  getGlobal(): MemoryEntry[] {
    const now = new Date().toISOString();
    return this.store
      .list<MemoryEntry>(MEMORY_TABLE)
      .filter((e) => e.scope === 'global' && (!e.expiresAt || e.expiresAt > now));
  }

  getByKindGlobal(kind: MemoryEntry['kind']): MemoryEntry[] {
    return this.getGlobal().filter((e) => e.kind === kind);
  }

  add(entry: Omit<MemoryEntry, 'id' | 'createdAt'>): MemoryEntry {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000);

    const newEntry: MemoryEntry = {
      ...entry,
      id: randomUUID().slice(0, 8),
      createdAt: now.toISOString(),
      expiresAt: entry.expiresAt ?? expiresAt.toISOString(),
    };

    this.store.upsert(MEMORY_TABLE, newEntry);
    return newEntry;
  }

  getForConversation(conversationId: string): MemoryEntry[] {
    const now = new Date().toISOString();
    return this.store
      .list<MemoryEntry>(MEMORY_TABLE, { where: { conversationId } })
      .filter((e) => e.scope !== 'global' && (!e.expiresAt || e.expiresAt > now));
  }

  getByKind(conversationId: string, kind: MemoryEntry['kind']): MemoryEntry[] {
    return this.getForConversation(conversationId).filter((e) => e.kind === kind);
  }

  remove(id: string): boolean {
    return this.store.delete(MEMORY_TABLE, id);
  }

  prune(): number {
    const now = new Date().toISOString();
    const all = this.store.list<MemoryEntry>(MEMORY_TABLE);
    const expired = all.filter((e) => e.expiresAt != null && e.expiresAt < now);

    let count = 0;
    for (const entry of expired) {
      if (this.store.delete(MEMORY_TABLE, entry.id)) {
        count++;
      }
    }
    return count;
  }
}
