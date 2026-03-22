import type { StagingService } from './staging.service';
import type { CommandResult } from '../../contracts';

export function routeStagingCommand(text: string, service: StagingService): CommandResult | null {
  const approveMatch = /^approve\s+(\S+)/i.exec(text);
  if (approveMatch) {
    const result = service.approve(approveMatch[1]);
    if (result.ok) {
      return { handled: true, commandType: 'session', reply: `_Approved._ Here is the action:\n${result.text}` };
    }
    return { handled: true, commandType: 'session', reply: `_Could not approve:_ ${result.error}` };
  }

  const rejectMatch = /^reject\s+(\S+)/i.exec(text);
  if (rejectMatch) {
    const result = service.reject(rejectMatch[1]);
    if (result.ok) {
      return { handled: true, commandType: 'session', reply: result.message ?? '_Rejected._' };
    }
    return { handled: true, commandType: 'session', reply: `_Could not reject:_ ${result.error}` };
  }

  if (/^staged list/i.test(text)) {
    const pending = service.listPending();
    if (pending.length === 0) {
      return { handled: true, commandType: 'session', reply: '_No staged actions pending._' };
    }
    const lines = pending.map(
      (a) => `• \`${a.id}\` [${a.riskLevel}] ${a.text.slice(0, 80)}`,
    );
    return { handled: true, commandType: 'session', reply: `*Staged actions:*\n${lines.join('\n')}` };
  }

  return null;
}
