import { randomUUID } from 'node:crypto';
import type { DurableStore } from '../../store/store.contract';
import type { StagedAction } from './staged.action';
import type { RiskLevel } from '../../policy/risk.classifier';

const TABLE = 'staged_actions';

interface StageInput {
  conversationId: string;
  text: string;
  riskLevel: RiskLevel;
}

interface ApproveResult {
  ok: boolean;
  text?: string;
  error?: string;
}

interface RejectResult {
  ok: boolean;
  message?: string;
  error?: string;
}

export class StagingService {
  constructor(private store: DurableStore) {}

  stage(input: StageInput): StagedAction {
    const action: StagedAction = {
      id: randomUUID().slice(0, 8),
      conversationId: input.conversationId,
      text: input.text,
      riskLevel: input.riskLevel,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    this.store.upsert(TABLE, action);
    return action;
  }

  approve(id: string): ApproveResult {
    const action = this.store.get<StagedAction>(TABLE, id);
    if (!action) return { ok: false, error: `Staged action not found: ${id}` };
    if (action.status !== 'pending') return { ok: false, error: `Action ${id} is already ${action.status}` };

    this.store.upsert(TABLE, { ...action, status: 'approved' });
    return { ok: true, text: action.text };
  }

  reject(id: string): RejectResult {
    const action = this.store.get<StagedAction>(TABLE, id);
    if (!action) return { ok: false, error: `Staged action not found: ${id}` };
    if (action.status !== 'pending') return { ok: false, error: `Action ${id} is already ${action.status}` };

    this.store.upsert(TABLE, { ...action, status: 'rejected' });
    return { ok: true, message: `Action \`${id}\` rejected.` };
  }

  listPending(): StagedAction[] {
    return this.store.list<StagedAction>(TABLE, { where: { status: 'pending' } });
  }
}
