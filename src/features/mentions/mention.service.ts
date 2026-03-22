import { randomUUID } from 'node:crypto';
import type { DurableStore } from '../../store/store.contract';
import type { MentionRecord, MentionStatus } from './mention.types';

const TABLE = 'mentions';

export class MentionService {
  constructor(private store: DurableStore) {}

  record(params: Omit<MentionRecord, 'id' | 'status' | 'createdAt' | 'updatedAt'>): MentionRecord {
    const now = new Date().toISOString();
    const mention: MentionRecord = {
      ...params,
      id: randomUUID(),
      status: 'new',
      createdAt: now,
      updatedAt: now,
    };
    this.store.upsert(TABLE, mention);
    return mention;
  }

  transition(
    id: string,
    status: MentionStatus,
    extra?: Partial<MentionRecord>,
  ): MentionRecord | undefined {
    const existing = this.store.get<MentionRecord>(TABLE, id);
    if (!existing) return undefined;
    const updated: MentionRecord = {
      ...existing,
      ...extra,
      id: existing.id,
      status,
      updatedAt: new Date().toISOString(),
    };
    this.store.upsert(TABLE, updated);
    return updated;
  }

  listByStatus(...statuses: MentionStatus[]): MentionRecord[] {
    const all = this.store.list<MentionRecord>(TABLE);
    if (statuses.length === 0) return all;
    return all.filter(m => statuses.includes(m.status));
  }

  getStale(olderThanMs: number): MentionRecord[] {
    const cutoff = new Date(Date.now() - olderThanMs).toISOString();
    return this.store
      .list<MentionRecord>(TABLE)
      .filter(m => m.status === 'new' && m.createdAt < cutoff);
  }

  format(mentions: MentionRecord[]): string {
    if (mentions.length === 0) return '_No mentions._';
    return mentions
      .map(m => `• \`${m.id.slice(0, 8)}\` [${m.status}] ${m.text.slice(0, 80)} — <@${m.actorId}>`)
      .join('\n');
  }
}
