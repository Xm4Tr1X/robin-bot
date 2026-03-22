import type { CommandResult } from '../../contracts';
import type { AlertService } from './alert.service';

export function routeAlertCommand(text: string, svc: AlertService): CommandResult | null {
  if (/^alerts? list/i.test(text) || /^show alerts?/i.test(text)) {
    return { handled: true, commandType: 'alert', reply: svc.format(svc.listAll()) };
  }

  if (/^alerts? open/i.test(text) || /^open alerts?/i.test(text)) {
    return { handled: true, commandType: 'alert', reply: svc.format(svc.listOpen()) };
  }

  const ackMatch = /^alerts? ack\s+(\S+)/i.exec(text);
  if (ackMatch) {
    const updated = svc.transition(ackMatch[1], 'acked');
    if (!updated) {
      return {
        handled: true,
        commandType: 'alert',
        reply: `_Alert \`${ackMatch[1]}\` not found._`,
      };
    }
    return {
      handled: true,
      commandType: 'alert',
      reply: `_Alert \`${updated.id.slice(0, 8)}\` acknowledged._`,
    };
  }

  const resolveMatch = /^alerts? resolve\s+(\S+)/i.exec(text);
  if (resolveMatch) {
    const updated = svc.transition(resolveMatch[1], 'resolved');
    if (!updated) {
      return {
        handled: true,
        commandType: 'alert',
        reply: `_Alert \`${resolveMatch[1]}\` not found._`,
      };
    }
    return {
      handled: true,
      commandType: 'alert',
      reply: `_Alert \`${updated.id.slice(0, 8)}\` resolved._`,
    };
  }

  const profileAddMatch = /^alert profile add\s+(\S+)\s*(.*)?/i.exec(text);
  if (profileAddMatch) {
    const channelId = profileAddMatch[1];
    const keywordsRaw = profileAddMatch[2] ?? '';
    const keywords = keywordsRaw
      .split(',')
      .map(k => k.trim())
      .filter(Boolean);
    svc.addChannelProfile(channelId, keywords);
    return {
      handled: true,
      commandType: 'alert',
      reply: `_Added alert profile for \`${channelId}\` with ${keywords.length} keyword(s)._`,
    };
  }

  const profileRemoveMatch = /^alert profile remove\s+(\S+)/i.exec(text);
  if (profileRemoveMatch) {
    const removed = svc.removeChannelProfile(profileRemoveMatch[1]);
    if (!removed) {
      return {
        handled: true,
        commandType: 'alert',
        reply: `_Profile \`${profileRemoveMatch[1]}\` not found._`,
      };
    }
    return {
      handled: true,
      commandType: 'alert',
      reply: `_Removed alert profile for \`${profileRemoveMatch[1]}\`._`,
    };
  }

  if (/^alert profile list/i.test(text)) {
    const profiles = svc.listProfiles();
    if (profiles.length === 0) {
      return {
        handled: true,
        commandType: 'alert',
        reply: '_No alert profiles configured._',
      };
    }
    const formatted = profiles
      .map(
        p =>
          `• \`${p.channelId}\` [${p.enabled ? 'on' : 'off'}] keywords: ${(JSON.parse(p.keywords) as string[]).join(', ')}`,
      )
      .join('\n');
    return { handled: true, commandType: 'alert', reply: formatted };
  }

  return null;
}
