import type { StoreRecord } from '../../store/store.contract';

export type AlertTriage = 'noise' | 'investigate' | 'critical';
export type AlertStatus = 'open' | 'acked' | 'resolved';

export interface AlertRecord extends StoreRecord {
  id: string;
  channelId: string;
  text: string;
  ts: string;
  triage: AlertTriage;
  status: AlertStatus;
  draftArtifact?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AlertChannelProfile extends StoreRecord {
  id: string;       // same as channelId
  channelId: string;
  enabled: boolean;
  keywords: string; // JSON-encoded string[] for SQLite compatibility
  createdAt: string;
}
