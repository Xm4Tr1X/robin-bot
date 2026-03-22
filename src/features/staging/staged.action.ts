import type { StoreRecord } from '../../store/store.contract';
import type { RiskLevel } from '../../policy/risk.classifier';

export type StagedActionStatus = 'pending' | 'approved' | 'rejected';

export interface StagedAction extends StoreRecord {
  id: string;
  conversationId: string;
  text: string;
  riskLevel: RiskLevel;
  status: StagedActionStatus;
  createdAt: string;
}
