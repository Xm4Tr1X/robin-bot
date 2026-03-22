import type { StoreRecord } from '../store/store.contract';

export interface ActivityRecord extends StoreRecord {
  id: string;
  channelId: string;
  actorId: string;
  text: string;
  ts: string;
  threadTs?: string;
  threadContext?: string;
  createdAt: string;
}
