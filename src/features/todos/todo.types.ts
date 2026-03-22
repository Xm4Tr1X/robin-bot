import type { StoreRecord } from '../../store/store.contract';

export type PendingTodoStatus = 'pending' | 'approved' | 'rejected';

export interface PendingTodo extends StoreRecord {
  id: string;
  task: string;
  priority: 'high' | 'medium' | 'low';
  bucket: 'short-term' | 'long-term';
  confidence: number;
  sourceConversationId: string;
  sourceMentionId?: string;
  status: PendingTodoStatus;
  approvedBy?: string;
  createdAt: string;
  updatedAt: string;
}
