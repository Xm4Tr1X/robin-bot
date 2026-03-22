/**
 * Integration — MCP state machine flow
 *
 * Exercises the full add → validate → test → enable/disable lifecycle
 * using real MCPService with MemoryStore, and verifies audit events.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStore } from '../../src/store/memory.store.js';
import { MCPService } from '../../src/features/mcp/mcp.service.js';
import { auditService } from '../../src/audit/audit.service.js';

describe('MCP state machine — integration', () => {
  let store: MemoryStore;
  let svc: MCPService;

  beforeEach(() => {
    store = new MemoryStore();
    svc = new MCPService(store);
    auditService.clearLog();
  });

  it('full lifecycle: add → validate → test → enable', () => {
    const conn = svc.add('GitHub', 'https://api.github.com/mcp');
    expect(conn.status).toBe('pending');

    const validated = svc.validate(conn.id);
    expect(validated?.status).toBe('validated');

    const tested = svc.test(conn.id);
    expect(tested?.status).toBe('tested');

    const enabled = svc.enable(conn.id);
    expect(enabled?.status).toBe('enabled');
  });

  it('enable without test fails — returns error without persisting', () => {
    const conn = svc.add('GitHub', 'https://api.github.com/mcp');
    svc.validate(conn.id);
    // skip test — try to enable directly
    const result = svc.enable(conn.id);
    expect(result?.lastError).toContain('tested');
    // status must NOT have advanced to enabled in store
    expect(svc.getById(conn.id)?.status).toBe('validated');
  });

  it('test without validate fails — status transitions to failed', () => {
    const conn = svc.add('GitHub', 'https://api.github.com/mcp');
    // skip validate — try to test directly
    const result = svc.test(conn.id);
    expect(result?.status).toBe('failed');
    expect(result?.lastError).toContain('validated');
  });

  it('disable transitions any enabled connection to disabled', () => {
    const conn = svc.add('Slack', 'https://slack.example.com/mcp');
    svc.validate(conn.id);
    svc.test(conn.id);
    svc.enable(conn.id);
    const disabled = svc.disable(conn.id);
    expect(disabled?.status).toBe('disabled');
    expect(svc.getEnabledConnections()).toHaveLength(0);
  });

  it('mcp.action audit events are emitted at validate, test, enable, disable', () => {
    const conn = svc.add('GitHub', 'https://api.github.com/mcp');
    auditService.clearLog(); // clear the add event if any
    svc.validate(conn.id);
    svc.test(conn.id);
    svc.enable(conn.id);
    svc.disable(conn.id);
    const mcpEvents = auditService.getLog().filter(e => e.event_type === 'mcp.action');
    expect(mcpEvents.length).toBeGreaterThanOrEqual(4);
    const actions = mcpEvents.map(e => e.metadata?.action);
    expect(actions).toContain('validate');
    expect(actions).toContain('test');
    expect(actions).toContain('enable');
    expect(actions).toContain('disable');
  });
});
