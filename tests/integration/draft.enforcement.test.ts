/**
 * Integration — Draft enforcement
 *
 * Verifies that alerts and comms features produce draft-only artifacts,
 * and that secrets injected via variables are redacted before output.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStore } from '../../src/store/memory.store.js';
import { AlertService } from '../../src/features/alerts/alert.service.js';
import { CommsService } from '../../src/features/comms/comms.service.js';
import { auditService } from '../../src/audit/audit.service.js';

describe('Draft enforcement — integration', () => {
  let store: MemoryStore;
  let alertSvc: AlertService;
  let commsSvc: CommsService;

  beforeEach(() => {
    store = new MemoryStore();
    alertSvc = new AlertService(store);
    commsSvc = new CommsService();
    auditService.clearLog();
  });

  // ---------------------------------------------------------------------------
  // Alert draft enforcement
  // ---------------------------------------------------------------------------

  it('ingested alert is open — it does not auto-resolve', () => {
    const alert = alertSvc.ingest({ title: 'API latency spike', body: 'p99 > 2s', source: 'slack', channelId: 'C_ALERTS' });
    expect(alert.status).toBe('open');
    // Must not auto-transition to resolved
    const fetched = alertSvc.listOpen();
    expect(fetched.some(a => a.id === alert.id)).toBe(true);
  });

  it('alert requires explicit ack transition — status remains open until commanded', () => {
    const alert = alertSvc.ingest({ title: 'Disk full', body: '95%', source: 'slack', channelId: 'C_OPS' });
    expect(alert.status).toBe('open');
    // Explicit ack
    const acked = alertSvc.transition(alert.id, 'acked');
    expect(acked?.status).toBe('acked');
    // Original open list should no longer contain it
    expect(alertSvc.listOpen().some(a => a.id === alert.id)).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Comms draft enforcement
  // ---------------------------------------------------------------------------

  it('comms render always returns a draft artifact (never raw send)', () => {
    const template = commsSvc.getTemplate('incident-update')!;
    const draft = commsSvc.render(template, {
      title: 'DB outage',
      status: 'investigating',
      impact: 'high',
      eta: '2h',
      description: 'Database unreachable',
    });
    // Draft exists and has an id — caller must explicitly approve before sending
    expect(draft.id).toBeTruthy();
    expect(draft.content).toContain('DB outage');
    expect(draft.redacted).toBe(false);
  });

  it('comms draft with secrets in variables is redacted before output', () => {
    const template = commsSvc.getTemplate('incident-update')!;
    const draft = commsSvc.render(template, {
      title: 'Auth outage',
      status: 'investigating',
      impact: 'high',
      eta: '1h',
      description: 'token xoxb-' + '123456789012-abcdefghijklmnop leaked in payload',
    });
    expect(draft.redacted).toBe(true);
    expect(draft.content).not.toContain('xoxb-');
    expect(draft.content).toContain('[SLACK_TOKEN]');
  });

  it('comms.draft.generated audit event is emitted on render', () => {
    const template = commsSvc.getTemplate('weekly-summary')!;
    commsSvc.render(template, {
      week: '2026-W10',
      completed: 'deployed service',
      in_progress: 'testing',
      blocked: 'none',
    });
    const events = auditService.getLog().filter(e => e.event_type === 'comms.draft.generated');
    expect(events).toHaveLength(1);
    expect(events[0].outcome).toBe('allowed');
    expect(events[0].metadata?.templateId).toBe('weekly-summary');
  });
});
