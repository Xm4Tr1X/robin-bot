import { randomUUID } from 'node:crypto';
import { redactSecrets } from '../../policy/redaction';
import type { CommsTemplate, CommsDraft } from './comms.types';
import { auditService } from '../../audit/audit.service';

const BUILTIN_TEMPLATES: CommsTemplate[] = [
  {
    id: 'incident-update',
    name: 'Incident Update',
    description: 'Status update for an ongoing incident',
    template:
      '*Incident Update — {{title}}*\n\nStatus: {{status}}\nImpact: {{impact}}\nETA: {{eta}}\n\nUpdate: {{description}}',
    variables: ['title', 'status', 'impact', 'eta', 'description'],
  },
  {
    id: 'weekly-summary',
    name: 'Weekly Summary',
    description: 'Weekly team summary',
    template:
      '*Week of {{week}}*\n\nCompleted:\n{{completed}}\n\nIn Progress:\n{{in_progress}}\n\nBlocked:\n{{blocked}}',
    variables: ['week', 'completed', 'in_progress', 'blocked'],
  },
  {
    id: 'deployment-notice',
    name: 'Deployment Notice',
    description: 'Notify team of a deployment',
    template:
      '*Deployment Notice*\n\nService: {{service}}\nVersion: {{version}}\nEnvironment: {{env}}\nTime: {{time}}\n\nChanges: {{changes}}',
    variables: ['service', 'version', 'env', 'time', 'changes'],
  },
];

export class CommsService {
  listTemplates(): CommsTemplate[] {
    return BUILTIN_TEMPLATES;
  }

  getTemplate(id: string): CommsTemplate | undefined {
    return BUILTIN_TEMPLATES.find(t => t.id === id);
  }

  render(template: CommsTemplate, variables: Record<string, string>): CommsDraft {
    let content = template.template;
    for (const [key, value] of Object.entries(variables)) {
      content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }
    const result = redactSecrets(content);
    const draft: CommsDraft = {
      id: randomUUID(),
      templateId: template.id,
      content: result.redacted,
      redacted: result.found.length > 0,
      createdAt: new Date().toISOString(),
    };
    auditService.emit({
      event_type: 'comms.draft.generated',
      outcome: 'allowed',
      metadata: { templateId: template.id, redacted: draft.redacted },
    });
    return draft;
  }

  missingVariables(template: CommsTemplate, provided: Record<string, string>): string[] {
    return template.variables.filter(v => !(v in provided) || provided[v].trim() === '');
  }

  formatTemplateList(templates: CommsTemplate[]): string {
    if (templates.length === 0) return '_No templates available._';
    return templates
      .map(t => `• \`${t.id}\` *${t.name}* — ${t.description}`)
      .join('\n');
  }

  formatDraft(draft: CommsDraft): string {
    const header = `*Draft — review before sending:*\n\`\`\`\n${draft.content}\n\`\`\``;
    return draft.redacted
      ? `${header}\n_⚠️ Secrets were redacted from this draft._`
      : header;
  }
}
