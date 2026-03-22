import type { IngressSource } from '../../contracts';
import type { StoreRecord } from '../../store/store.contract';

export type MentionStatus = 'new' | 'triaged' | 'converted' | 'dismissed' | 'done';

export interface MentionRecord extends StoreRecord {
  id: string;
  actorId: string;
  source: IngressSource;
  channelId?: string;
  conversationId: string;
  threadId?: string;
  text: string;
  ts: string;
  status: MentionStatus;
  convertedTodoId?: string;
  createdAt: string;
  updatedAt: string;
}
