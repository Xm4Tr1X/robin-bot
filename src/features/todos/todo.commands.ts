import type { CommandResult } from '../../contracts';
import type { TodoApprovalService } from './todo.approval';

export function routeTodoApprovalCommand(
  text: string,
  svc: TodoApprovalService,
  actorId: string,
): CommandResult | null {
  if (/^todo pending/i.test(text) || /^pending todos?/i.test(text)) {
    return { handled: true, commandType: 'todo', reply: svc.format(svc.listPending()) };
  }

  const approveMatch = /^todo approve\s+(\S+)/i.exec(text);
  if (approveMatch) {
    const updated = svc.approve(approveMatch[1], actorId);
    if (!updated) {
      return {
        handled: true,
        commandType: 'todo',
        reply: `_Todo \`${approveMatch[1]}\` not found or not pending._`,
      };
    }
    return {
      handled: true,
      commandType: 'todo',
      reply: `_Approved todo \`${updated.id.slice(0, 8)}\` — added to ledger._`,
    };
  }

  const rejectMatch = /^todo reject\s+(\S+)/i.exec(text);
  if (rejectMatch) {
    const updated = svc.reject(rejectMatch[1]);
    if (!updated) {
      return {
        handled: true,
        commandType: 'todo',
        reply: `_Todo \`${rejectMatch[1]}\` not found or not pending._`,
      };
    }
    return {
      handled: true,
      commandType: 'todo',
      reply: `_Rejected todo \`${updated.id.slice(0, 8)}\`._`,
    };
  }

  return null;
}
