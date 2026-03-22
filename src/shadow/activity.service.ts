import type { DurableStore } from '../store/store.contract';
import type { ActivityRecord } from './activity.types';

const TABLE = 'owner_activity';

type RecordInput = Omit<ActivityRecord, 'id' | 'createdAt'>;

/**
 * Derives a stable id from channelId + ts so duplicate events upsert rather than duplicate.
 */
function deriveId(channelId: string, ts: string): string {
  return `${channelId}:${ts}`;
}

export class ActivityService {
  constructor(private store: DurableStore) {}

  record(input: RecordInput): ActivityRecord {
    const id = deriveId(input.channelId, input.ts);
    const record: ActivityRecord = {
      ...input,
      id,
      createdAt: new Date().toISOString(),
    };
    this.store.upsert(TABLE, record);
    return record;
  }

  /**
   * Returns the n most recent activity records, newest first.
   * If n is 0, returns all records.
   */
  listRecent(n: number): ActivityRecord[] {
    const all = this.store.list<ActivityRecord>(TABLE, {
      orderBy: { field: 'ts', dir: 'desc' },
    });
    if (n === 0) return all;
    return all.slice(0, n);
  }

  /**
   * Removes records older than olderThanMs milliseconds.
   * Returns the number of records removed.
   */
  prune(olderThanMs: number): number {
    const cutoff = new Date(Date.now() - olderThanMs).toISOString();
    const all = this.store.list<ActivityRecord>(TABLE);
    const toDelete = all.filter((r) => r.createdAt < cutoff);
    for (const r of toDelete) {
      this.store.delete(TABLE, r.id);
    }
    return toDelete.length;
  }
}
