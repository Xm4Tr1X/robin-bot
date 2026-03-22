import { describe, it, expect, beforeEach } from 'vitest';
import { AuditService } from '../../../src/audit/audit.service.js';

describe('AuditService', () => {
  let svc: AuditService;

  beforeEach(() => {
    svc = new AuditService();
  });

  // ---------------------------------------------------------------------------
  // emit() — required fields
  // ---------------------------------------------------------------------------

  describe('emit() — required fields', () => {
    it('stores a structured event with all required fields', () => {
      svc.emit({ event_type: 'access.denied', outcome: 'denied' });
      const log = svc.getLog();
      expect(log).toHaveLength(1);
      expect(log[0].event_type).toBe('access.denied');
      expect(log[0].outcome).toBe('denied');
      expect(log[0].actor_id).toBe('system');
      expect(log[0].timestamp).toBeTruthy();
      expect(log[0].correlation_id).toBeTruthy();
    });

    it('uses provided actor_id', () => {
      svc.emit({ event_type: 'mode.changed', outcome: 'allowed', actor_id: 'U_OWNER' });
      expect(svc.getLog()[0].actor_id).toBe('U_OWNER');
    });

    it('defaults actor_id to "system" when not provided', () => {
      svc.emit({ event_type: 'access.denied', outcome: 'denied' });
      expect(svc.getLog()[0].actor_id).toBe('system');
    });

    it('uses provided correlation_id', () => {
      svc.emit({ event_type: 'mode.changed', outcome: 'allowed', correlation_id: 'CORR-123' });
      expect(svc.getLog()[0].correlation_id).toBe('CORR-123');
    });

    it('generates a unique correlation_id when not provided', () => {
      svc.emit({ event_type: 'access.denied', outcome: 'denied' });
      svc.emit({ event_type: 'access.denied', outcome: 'denied' });
      const [e1, e2] = svc.getLog();
      expect(e1.correlation_id).not.toBe(e2.correlation_id);
    });

    it('stores metadata when provided', () => {
      svc.emit({
        event_type: 'runner.telemetry',
        outcome: 'allowed',
        metadata: { latencyMs: 300, inputTokens: 120 },
      });
      const { metadata } = svc.getLog()[0];
      expect(metadata?.latencyMs).toBe(300);
      expect(metadata?.inputTokens).toBe(120);
    });

    it('omits metadata key when not provided', () => {
      svc.emit({ event_type: 'access.denied', outcome: 'denied' });
      expect(svc.getLog()[0].metadata).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // getLog() — copy semantics
  // ---------------------------------------------------------------------------

  describe('getLog()', () => {
    it('returns a copy — external mutations do not affect internal log', () => {
      svc.emit({ event_type: 'access.denied', outcome: 'denied' });
      const snapshot = svc.getLog();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (snapshot as any[]).push({ event_type: 'mcp.action', outcome: 'allowed' });
      expect(svc.getLog()).toHaveLength(1);
    });

    it('accumulates multiple events in insertion order', () => {
      svc.emit({ event_type: 'access.denied', outcome: 'denied' });
      svc.emit({ event_type: 'mode.changed', outcome: 'allowed' });
      svc.emit({ event_type: 'mcp.action', outcome: 'allowed' });
      const log = svc.getLog();
      expect(log).toHaveLength(3);
      expect(log[0].event_type).toBe('access.denied');
      expect(log[2].event_type).toBe('mcp.action');
    });
  });

  // ---------------------------------------------------------------------------
  // clearLog()
  // ---------------------------------------------------------------------------

  it('clearLog() empties the log', () => {
    svc.emit({ event_type: 'access.denied', outcome: 'denied' });
    svc.emit({ event_type: 'mode.changed', outcome: 'allowed' });
    svc.clearLog();
    expect(svc.getLog()).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // Secret redaction in metadata
  // ---------------------------------------------------------------------------

  describe('metadata secret sanitisation', () => {
    it('redacts Slack token found in a string metadata value', () => {
      svc.emit({
        event_type: 'comms.draft.generated',
        outcome: 'allowed',
        metadata: { preview: 'token xoxb-' + '123456789012-abcdefghijklmnop here' },
      });
      const stored = JSON.stringify(svc.getLog()[0]);
      expect(stored).not.toContain('xoxb-');
      expect(stored).toContain('[SLACK_TOKEN]');
    });

    it('does not alter numeric metadata values', () => {
      svc.emit({
        event_type: 'runner.telemetry',
        outcome: 'allowed',
        metadata: { latencyMs: 42 },
      });
      expect(svc.getLog()[0].metadata?.latencyMs).toBe(42);
    });

    it('does not alter boolean metadata values', () => {
      svc.emit({
        event_type: 'comms.draft.generated',
        outcome: 'allowed',
        metadata: { redacted: true },
      });
      expect(svc.getLog()[0].metadata?.redacted).toBe(true);
    });
  });
});
