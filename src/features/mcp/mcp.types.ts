import type { StoreRecord } from '../../store/store.contract';

export type MCPStatus = 'pending' | 'validated' | 'tested' | 'enabled' | 'disabled' | 'failed';

export interface MCPConnection extends StoreRecord {
  id: string;
  name: string;
  endpoint: string;
  status: MCPStatus;
  config?: string;      // JSON string
  createdAt: string;
  validatedAt?: string;
  testedAt?: string;
  enabledAt?: string;
  lastError?: string;
}
