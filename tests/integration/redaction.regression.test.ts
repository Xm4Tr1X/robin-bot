/**
 * Integration — Redaction regression
 *
 * End-to-end checks that secret patterns are correctly suppressed across
 * the pipeline layers: CommsService variables, AssistantService runner
 * response, and AuditService metadata.
 *
 * These are regression tests to prevent false negatives (secrets slipping
 * through) across module boundaries.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CommsService } from '../../src/features/comms/comms.service.js';
import { AssistantService } from '../../src/core/assistant.service.js';
import { MemoryService } from '../../src/memory/memory.service.js';
import { MemoryStore } from '../../src/store/memory.store.js';
import { AuditService } from '../../src/audit/audit.service.js';
import type { IngressEvent } from '../../src/contracts.js';

function makeEvent(text: string): IngressEvent {
  return {
    id: 'RRED1',
    source: 'cli',
    actorId: 'U_OWNER',
    conversationId: 'C_RRED:T1',
    text,
    ts: '4000',
  };
}

describe('Redaction regression — integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // CommsService — variables containing secrets are redacted in draft output
  // ---------------------------------------------------------------------------

  describe('CommsService variable redaction', () => {
    const svc = new CommsService();

    it('Slack bot token in variable is redacted in rendered draft', () => {
      const template = svc.getTemplate('incident-update')!;
      const draft = svc.render(template, {
        title: 'Auth incident',
        status: 'open',
        impact: 'high',
        eta: '2h',
        description: 'token xoxb-' + '123456789012-abcdefghijklmnopqrstuvwxyz',
      });
      expect(draft.redacted).toBe(true);
      expect(draft.content).not.toMatch(/xoxb-/);
    });

    it('AWS access key in variable is redacted in rendered draft', () => {
      const template = svc.getTemplate('incident-update')!;
      const draft = svc.render(template, {
        title: 'Key leak',
        status: 'open',
        impact: 'critical',
        eta: '30m',
        description: 'Found AKIAIOSFODNN7EXAMPLE in logs',
      });
      expect(draft.redacted).toBe(true);
      expect(draft.content).not.toContain('AKIAIOSFODNN7EXAMPLE');
    });

    it('plain text without secrets is not redacted', () => {
      const template = svc.getTemplate('deployment-notice')!;
      const draft = svc.render(template, {
        service: 'api-gateway',
        version: 'v1.2.3',
        env: 'production',
        time: '2026-03-09T18:00:00Z',
        changes: 'performance improvements',
      });
      expect(draft.redacted).toBe(false);
      expect(draft.content).toContain('api-gateway');
    });
  });

  // ---------------------------------------------------------------------------
  // AssistantService — secrets in runner response are redacted before reply
  // ---------------------------------------------------------------------------

  describe('AssistantService response redaction', () => {
    it('runner response containing API key is redacted before final text', async () => {
      const runner = {
        run: vi.fn().mockResolvedValue({
          requestId: 'R2',
          sessionId: 'S2',
          text: 'Here is your key: sk-abcdefghijklmnopqrstuvwxyz12345',
          toolTrace: [],
        }),
      };
      const svc = new AssistantService({
        allowedTools: [],
        memoryService: new MemoryService(new MemoryStore()),
        runnerClient: runner as never,
      });
      const response = await svc.handle(makeEvent('show my api key'));
      // Safety postcheck redacts secrets before final text
      expect(response.text).not.toContain('sk-abcdefghijklmnopqrstuvwxyz');
      expect(response.text).toContain('[API_KEY]');
    });
  });

  // ---------------------------------------------------------------------------
  // AuditService — string metadata is sanitised before storage
  // ---------------------------------------------------------------------------

  describe('AuditService metadata sanitisation', () => {
    it('bearer token in string metadata is redacted', () => {
      const audit = new AuditService();
      audit.emit({
        event_type: 'comms.draft.generated',
        outcome: 'allowed',
        metadata: { snippet: 'Authorization: Bearer eyJhbGciOiJSUzI1NiJ9.payload.sig' },
      });
      const stored = JSON.stringify(audit.getLog()[0]);
      expect(stored).not.toContain('eyJhbGciOiJSUzI1NiJ9');
      expect(stored).toContain('[BEARER_TOKEN]');
    });
  });
});
