import { randomUUID } from 'node:crypto';
import type { DurableStore } from '../../store/store.contract';
import { ledgerHolder } from '../../todo';
import type { PendingTodo } from './todo.types';

const TABLE = 'pending_todos';

export const CONFIDENCE_THRESHOLD = 0.7;

export class TodoApprovalService {
  constructor(private store: DurableStore) {}

  propose(
    task: string,
    priority: 'high' | 'medium' | 'low',
    bucket: 'short-term' | 'long-term',
    confidence: number,
    sourceConversationId: string,
    sourceMentionId?: string,
  ): PendingTodo {
    const now = new Date().toISOString();
    const pending: PendingTodo = {
      id: randomUUID(),
      task,
      priority,
      bucket,
      confidence,
      sourceConversationId,
      sourceMentionId,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    this.store.upsert(TABLE, pending);
    return pending;
  }

  approve(id: string, approvedBy: string): PendingTodo | undefined {
    const pending = this.store.get<PendingTodo>(TABLE, id);
    if (!pending || pending.status !== 'pending') return undefined;

    ledgerHolder.instance.add({
      task: pending.task,
      priority: pending.priority,
      bucket: pending.bucket,
      source: 'slack',
    });

    const updated: PendingTodo = {
      ...pending,
      status: 'approved',
      approvedBy,
      updatedAt: new Date().toISOString(),
    };
    this.store.upsert(TABLE, updated);
    return updated;
  }

  reject(id: string): PendingTodo | undefined {
    const pending = this.store.get<PendingTodo>(TABLE, id);
    if (!pending || pending.status !== 'pending') return undefined;

    const updated: PendingTodo = {
      ...pending,
      status: 'rejected',
      updatedAt: new Date().toISOString(),
    };
    this.store.upsert(TABLE, updated);
    return updated;
  }

  listPending(): PendingTodo[] {
    return this.store.list<PendingTodo>(TABLE, { where: { status: 'pending' } });
  }

  isAboveThreshold(confidence: number): boolean {
    return confidence >= CONFIDENCE_THRESHOLD;
  }

  format(pendings: PendingTodo[]): string {
    if (pendings.length === 0) return '_No pending todos._';
    return pendings
      .map(
        p =>
          `• \`${p.id.slice(0, 8)}\` [${Math.round(p.confidence * 100)}%] *${p.task}* — ${p.priority}/${p.bucket}`,
      )
      .join('\n');
  }
}
