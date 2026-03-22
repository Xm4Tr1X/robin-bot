import type { CommandResult } from '../../contracts';
import type { MentionService } from './mention.service';

const STALE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function routeMentionCommand(text: string, svc: MentionService): CommandResult | null {
  if (/^mentions? list/i.test(text) || /^show mentions?/i.test(text)) {
    return { handled: true, commandType: 'mentions', reply: svc.format(svc.listByStatus()) };
  }

  const triageMatch = /^mentions? triage\s+(\S+)/i.exec(text);
  if (triageMatch) {
    const updated = svc.transition(triageMatch[1], 'triaged');
    if (!updated) {
      return {
        handled: true,
        commandType: 'mentions',
        reply: `_Mention \`${triageMatch[1]}\` not found._`,
      };
    }
    return {
      handled: true,
      commandType: 'mentions',
      reply: `_Mention \`${updated.id.slice(0, 8)}\` → triaged._`,
    };
  }

  const dismissMatch = /^mentions? dismiss\s+(\S+)/i.exec(text);
  if (dismissMatch) {
    const updated = svc.transition(dismissMatch[1], 'dismissed');
    if (!updated) {
      return {
        handled: true,
        commandType: 'mentions',
        reply: `_Mention \`${dismissMatch[1]}\` not found._`,
      };
    }
    return {
      handled: true,
      commandType: 'mentions',
      reply: `_Mention \`${updated.id.slice(0, 8)}\` dismissed._`,
    };
  }

  const doneMatch = /^mentions? done\s+(\S+)/i.exec(text);
  if (doneMatch) {
    const updated = svc.transition(doneMatch[1], 'done');
    if (!updated) {
      return {
        handled: true,
        commandType: 'mentions',
        reply: `_Mention \`${doneMatch[1]}\` not found._`,
      };
    }
    return {
      handled: true,
      commandType: 'mentions',
      reply: `_Mention \`${updated.id.slice(0, 8)}\` marked done._`,
    };
  }

  if (/^mentions? stale/i.test(text)) {
    const stale = svc.getStale(STALE_MS);
    if (stale.length === 0) {
      return { handled: true, commandType: 'mentions', reply: '_No stale mentions._' };
    }
    return {
      handled: true,
      commandType: 'mentions',
      reply: `*Stale mentions (>7 days):*\n${svc.format(stale)}`,
    };
  }

  return null;
}
