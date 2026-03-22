import { randomUUID } from 'crypto';
import type { TodoItem, Bucket, Priority, TodoSource } from './types';
import type { DurableStore } from './store/store.contract';

class TodoLedger {
  private items: TodoItem[] = [];

  constructor(private store?: DurableStore) {
    if (store) {
      this.items = store.list<TodoItem>('todos');
    }
  }

  add(params: {
    task: string;
    bucket: Bucket;
    priority: Priority;
    owner?: string;
    eta?: string;
    source?: TodoSource;
    slackChannel?: string;
    slackTs?: string;
  }): TodoItem {
    const item: TodoItem = {
      id: randomUUID().slice(0, 8),
      task: params.task,
      bucket: params.bucket,
      priority: params.priority,
      owner: params.owner ?? 'OWNER',
      eta: params.eta,
      status: 'todo',
      source: params.source,
      slackChannel: params.slackChannel,
      slackTs: params.slackTs,
      createdAt: new Date().toISOString(),
    };
    this.items.push(item);
    this.store?.upsert('todos', item);
    return item;
  }

  update(id: string, updates: Partial<Omit<TodoItem, 'id'>>): boolean {
    const idx = this.items.findIndex((i) => i.id === id);
    if (idx === -1) return false;
    this.items[idx] = { ...this.items[idx], ...updates };
    this.store?.upsert('todos', this.items[idx]);
    return true;
  }

  remove(id: string): boolean {
    const before = this.items.length;
    this.items = this.items.filter((i) => i.id !== id);
    if (this.items.length < before) {
      this.store?.delete('todos', id);
      return true;
    }
    return false;
  }

  /** Clears both in-memory and persisted state (used by "discard snapshot"). */
  clear(): void {
    this.items = [];
    this.store?.deleteWhere('todos', {});
  }

  getAll(): TodoItem[] {
    return [...this.items];
  }

  getActive(bucket: Bucket): TodoItem[] {
    return this.items.filter((i) => i.bucket === bucket && i.status !== 'done');
  }

  formatForSlack(): string {
    const shortTerm = this.getActive('short-term');
    const longTerm = this.getActive('long-term');

    const fmt = (item: TodoItem) =>
      `• [\`${item.id}\`] *${item.task}* — ${item.priority} | _${item.status}_${item.eta ? ` | ETA: ${item.eta}` : ''}`;

    const lines: string[] = [];
    if (shortTerm.length > 0) {
      lines.push('*Short-term:*');
      lines.push(...shortTerm.map(fmt));
    }
    if (longTerm.length > 0) {
      lines.push('*Long-term:*');
      lines.push(...longTerm.map(fmt));
    }
    return lines.length > 0 ? lines.join('\n') : '_No active todos._';
  }

  serialize(): TodoItem[] {
    return [...this.items];
  }

  load(items: TodoItem[]): void {
    this.items = [...items];
  }
}

export const ledgerHolder: { instance: TodoLedger } = { instance: new TodoLedger() };

/** Called once in bootstrap() before any event processing. Seeds from SQLite on init. */
export function initTodoLedger(store: DurableStore): void {
  ledgerHolder.instance = new TodoLedger(store);
}
