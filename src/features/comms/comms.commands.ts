import type { CommandResult } from '../../contracts';
import type { CommsService } from './comms.service';

export function routeCommsCommand(text: string, svc: CommsService): CommandResult | null {
  if (/^comm?s? list templates?/i.test(text) || /^list comm?s? templates?/i.test(text)) {
    return { handled: true, reply: svc.formatTemplateList(svc.listTemplates()) };
  }

  const draftMatch = /^comm?s? draft\s+(\S+)\s*(.*)?/i.exec(text);
  if (draftMatch) {
    const templateId = draftMatch[1];
    const argsRaw = (draftMatch[2] ?? '').trim();

    const template = svc.getTemplate(templateId);
    if (!template) {
      return {
        handled: true,
        reply: `_Template \`${templateId}\` not found. Use \`comms list templates\` to see available._`,
      };
    }

    const variables: Record<string, string> = {};
    for (const pair of argsRaw.split(/\s+/)) {
      const eqIdx = pair.indexOf('=');
      if (eqIdx > 0) {
        variables[pair.slice(0, eqIdx)] = pair.slice(eqIdx + 1);
      }
    }

    const missing = svc.missingVariables(template, variables);
    if (missing.length > 0) {
      return {
        handled: true,
        reply: `_Missing variables: ${missing.join(', ')}. Provide them as key=value pairs._`,
      };
    }

    const draft = svc.render(template, variables);
    return { handled: true, reply: svc.formatDraft(draft) };
  }

  return null;
}
