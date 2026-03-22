import type { CommandResult } from '../../contracts';
import type { PolicyService } from './policy.service';

export function routePolicyCommand(text: string, svc: PolicyService): CommandResult | null {
  if (/^policy show/i.test(text) || /^show policy/i.test(text)) {
    return { handled: true, commandType: 'policy', reply: svc.format() };
  }

  const setMatch = /^policy set\s+(\S+)\s+(.+)/i.exec(text);
  if (setMatch) {
    const field = setMatch[1];
    const value = setMatch[2].trim();
    const result = svc.set(field, value);
    if (!result.ok) {
      return { handled: true, commandType: 'policy', reply: `_Policy update failed: ${result.error}_` };
    }
    return {
      handled: true,
      commandType: 'policy',
      reply: `_Policy updated: \`${field}\` = \`${value}\`_`,
    };
  }

  if (/^policy help/i.test(text)) {
    return {
      handled: true,
      commandType: 'policy',
      reply: [
        '*Policy commands:*',
        '• `policy show` — display current access policy',
        '• `policy set <field> <value>` — update a policy field at runtime',
        '',
        '*Settable fields:*',
        '• `ownerUserId` — Slack user ID of the owner',
        '• `allowConversationsWithOthers` — true/false',
        '• `allowDmFromOthers` — true/false',
        '• `allowMentionsFromOthers` — true/false',
        '• `allowedUserIds` — comma-separated user IDs',
        '• `allowedChannelIds` — comma-separated channel IDs',
      ].join('\n'),
    };
  }

  return null;
}
