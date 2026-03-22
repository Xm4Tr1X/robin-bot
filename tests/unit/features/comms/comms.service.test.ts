import { describe, it, expect } from 'vitest';
import { CommsService } from '../../../../src/features/comms/comms.service.js';

describe('CommsService', () => {
  const svc = new CommsService();

  // ---------------------------------------------------------------------------
  // listTemplates()
  // ---------------------------------------------------------------------------

  describe('listTemplates()', () => {
    it('returns 3 built-in templates', () => {
      expect(svc.listTemplates().length).toBe(3);
    });

    it('includes the incident-update template', () => {
      expect(svc.listTemplates().some(t => t.id === 'incident-update')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // getTemplate()
  // ---------------------------------------------------------------------------

  describe('getTemplate()', () => {
    it('returns the correct template by id', () => {
      const t = svc.getTemplate('incident-update');
      expect(t?.name).toBe('Incident Update');
    });

    it('returns undefined for unknown id', () => {
      expect(svc.getTemplate('non-existent')).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // render()
  // ---------------------------------------------------------------------------

  describe('render()', () => {
    it('replaces all {{variable}} placeholders', () => {
      const t = svc.getTemplate('incident-update')!;
      const draft = svc.render(t, {
        title: 'DB Slowdown',
        status: 'investigating',
        impact: 'checkout degraded',
        eta: '30 min',
        description: 'High query times detected',
      });
      expect(draft.content).not.toContain('{{');
      expect(draft.content).toContain('DB Slowdown');
      expect(draft.content).toContain('investigating');
    });

    it('leaves unreplaced placeholders intact when variable is absent', () => {
      const t = svc.getTemplate('incident-update')!;
      const draft = svc.render(t, { title: 'Test' });
      expect(draft.content).toContain('{{status}}');
    });

    it('sets redacted=false when content contains no secrets', () => {
      const t = svc.getTemplate('deployment-notice')!;
      const draft = svc.render(t, {
        service: 'api',
        version: '1.2.3',
        env: 'prod',
        time: '12:00',
        changes: 'Bug fixes',
      });
      expect(draft.redacted).toBe(false);
    });

    it('sets a unique id and createdAt on each render', () => {
      const t = svc.getTemplate('weekly-summary')!;
      const vars = { week: 'Mar 3', completed: 'x', in_progress: 'y', blocked: 'z' };
      const d1 = svc.render(t, vars);
      const d2 = svc.render(t, vars);
      expect(d1.id).not.toBe(d2.id);
      expect(typeof d1.createdAt).toBe('string');
    });
  });

  // ---------------------------------------------------------------------------
  // missingVariables()
  // ---------------------------------------------------------------------------

  describe('missingVariables()', () => {
    it('returns empty array when all variables are provided', () => {
      const t = svc.getTemplate('deployment-notice')!;
      const result = svc.missingVariables(t, {
        service: 'api',
        version: '1.2.3',
        env: 'prod',
        time: '12:00',
        changes: 'fixes',
      });
      expect(result).toEqual([]);
    });

    it('returns names of missing variables', () => {
      const t = svc.getTemplate('deployment-notice')!;
      const result = svc.missingVariables(t, { service: 'api' });
      expect(result).toContain('version');
      expect(result).toContain('env');
    });

    it('treats empty-string values as missing', () => {
      const t = svc.getTemplate('deployment-notice')!;
      const result = svc.missingVariables(t, { service: '', version: '1.0', env: '', time: '', changes: '' });
      expect(result).toContain('service');
    });
  });

  // ---------------------------------------------------------------------------
  // formatTemplateList()
  // ---------------------------------------------------------------------------

  describe('formatTemplateList()', () => {
    it('returns _No templates available._ for empty array', () => {
      expect(svc.formatTemplateList([])).toBe('_No templates available._');
    });

    it('includes template id, name, and description', () => {
      const output = svc.formatTemplateList(svc.listTemplates());
      expect(output).toContain('incident-update');
      expect(output).toContain('Incident Update');
    });
  });

  // ---------------------------------------------------------------------------
  // formatDraft()
  // ---------------------------------------------------------------------------

  describe('formatDraft()', () => {
    it('wraps content in draft header', () => {
      const t = svc.getTemplate('deployment-notice')!;
      const draft = svc.render(t, {
        service: 'api',
        version: '1.2.3',
        env: 'prod',
        time: '12:00',
        changes: 'bug fixes',
      });
      const output = svc.formatDraft(draft);
      expect(output).toContain('Draft — review before sending');
      expect(output).toContain(draft.content);
    });

    it('appends redaction warning when redacted=true', () => {
      const fakeDraft = {
        id: 'x',
        templateId: 'x',
        content: 'some content',
        redacted: true,
        createdAt: new Date().toISOString(),
      };
      const output = svc.formatDraft(fakeDraft);
      expect(output).toContain('Secrets were redacted');
    });

    it('omits redaction warning when redacted=false', () => {
      const fakeDraft = {
        id: 'x',
        templateId: 'x',
        content: 'some content',
        redacted: false,
        createdAt: new Date().toISOString(),
      };
      const output = svc.formatDraft(fakeDraft);
      expect(output).not.toContain('Secrets were redacted');
    });
  });
});
