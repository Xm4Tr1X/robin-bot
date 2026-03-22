import type { CommandResult } from '../../contracts';
import { setAssistantMode, getAssistantMode } from '../../session';
import { auditService } from '../../audit/audit.service';

function splitConversation(conversationId: string): { channelId: string; threadId: string } {
  const idx = conversationId.indexOf(':');
  return idx === -1
    ? { channelId: conversationId, threadId: '' }
    : { channelId: conversationId.slice(0, idx), threadId: conversationId.slice(idx + 1) };
}

/**
 * Routes orchestrated / claude-direct assistant-mode commands.
 * Distinct from the response-mode commands (reply/draft/observe) in command.router.ts.
 */
export function routeAssistantModeCommand(
  text: string,
  conversationId: string,
): CommandResult | null {
  const { channelId, threadId } = splitConversation(conversationId);

  if (/^mode orchestrated/i.test(text)) {
    setAssistantMode(channelId, threadId, 'orchestrated');
    auditService.emit({
      event_type: 'mode.changed',
      outcome: 'allowed',
      metadata: { conversationId, mode: 'orchestrated' },
    });
    return {
      handled: true,
      commandType: 'mode',
      reply: '_Switched to *orchestrated* mode. Full pipeline active (memory, persona, safety gates)._',
    };
  }

  if (/^mode claude-direct/i.test(text)) {
    setAssistantMode(channelId, threadId, 'claude-direct');
    auditService.emit({
      event_type: 'mode.changed',
      outcome: 'allowed',
      metadata: { conversationId, mode: 'claude-direct' },
    });
    return {
      handled: true,
      commandType: 'mode',
      reply: '_Switched to *claude-direct* mode. Minimal mediation — safety gates still apply._',
    };
  }

  if (/^mode status/i.test(text)) {
    const mode = getAssistantMode(channelId, threadId);
    return {
      handled: true,
      commandType: 'mode',
      reply: `_Assistant mode: *${mode}*_`,
    };
  }

  return null;
}
