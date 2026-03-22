/**
 * Integration — Runner failure injection
 *
 * Tests AssistantService with a mocked RunnerClient that throws or
 * returns bad data. Verifies that failures degrade gracefully and
 * safety gates block appropriately — no process crash in any case.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AssistantService } from '../../src/core/assistant.service.js';
import { MemoryService } from '../../src/memory/memory.service.js';
import { MemoryStore } from '../../src/store/memory.store.js';
import { auditService } from '../../src/audit/audit.service.js';
import type { IngressEvent } from '../../src/contracts.js';

function makeEvent(text: string, overrides: Partial<IngressEvent> = {}): IngressEvent {
  return {
    id: 'R1',
    source: 'cli',
    actorId: 'U_OWNER',
    conversationId: 'C_FAIL:T1',
    text,
    ts: '3000',
    ...overrides,
  };
}

function makeService(runnerImpl: { run: ReturnType<typeof vi.fn> }) {
  return new AssistantService({
    allowedTools: [],
    memoryService: new MemoryService(new MemoryStore()),
    runnerClient: runnerImpl as never,
  });
}

describe('Runner failure injection — integration', () => {
  beforeEach(() => {
    auditService.clearLog();
    vi.clearAllMocks();
  });

  it('runner throw → safe "unavailable" response, no process crash', async () => {
    const runner = { run: vi.fn().mockRejectedValue(new Error('network timeout')) };
    const svc = makeService(runner);
    const response = await svc.handle(makeEvent('hello'));
    expect(response.text).toContain('unavailable');
    expect(response.isDraft).toBe(false);
    expect(runner.run).toHaveBeenCalledOnce();
  });

  it('runner throw → runner.telemetry audit event with blocked outcome', async () => {
    const runner = { run: vi.fn().mockRejectedValue(new Error('timeout')) };
    const svc = makeService(runner);
    await svc.handle(makeEvent('hello'));
    const telemetry = auditService.getLog().filter(e => e.event_type === 'runner.telemetry');
    expect(telemetry).toHaveLength(1);
    expect(telemetry[0].outcome).toBe('blocked');
    expect(typeof telemetry[0].metadata?.latencyMs).toBe('number');
  });

  it('safety precheck blocks secret-containing input before runner is called', async () => {
    // sk-<20+ chars> matches API_KEY pattern in safetyPrecheck
    const runner = { run: vi.fn() };
    const svc = makeService(runner);
    const response = await svc.handle(makeEvent('sk-abcdefghijklmnopqrstuvwxyz1234'));
    expect(response.text).toContain('safety check');
    expect(runner.run).not.toHaveBeenCalled();
  });

  it('safety postcheck blocks empty runner response', async () => {
    const runner = {
      run: vi.fn().mockResolvedValue({
        requestId: 'R1',
        sessionId: 'S1',
        text: '',
        toolTrace: [],
      }),
    };
    const svc = makeService(runner);
    const response = await svc.handle(makeEvent('hello'));
    expect(response.text).toContain('safety check');
    expect(runner.run).toHaveBeenCalledOnce();
  });

  it('persona guard blocks identity-impersonation in runner response', async () => {
    const runner = {
      run: vi.fn().mockResolvedValue({
        requestId: 'R1',
        sessionId: 'S1',
        text: 'I am not an AI, I am a human.',
        toolTrace: [],
      }),
    };
    const svc = makeService(runner);
    const response = await svc.handle(makeEvent('are you human?'));
    expect(response.text).toContain('compliance check');
    expect(runner.run).toHaveBeenCalledOnce();
  });

  it('successful runner call → runner.telemetry emitted with allowed outcome', async () => {
    const runner = {
      run: vi.fn().mockResolvedValue({
        requestId: 'R1',
        sessionId: 'S1',
        text: 'Hello there!',
        toolTrace: [],
        usage: { inputTokens: 10, outputTokens: 20 },
      }),
    };
    const svc = makeService(runner);
    await svc.handle(makeEvent('hello'));
    const telemetry = auditService.getLog().filter(e => e.event_type === 'runner.telemetry');
    expect(telemetry).toHaveLength(1);
    expect(telemetry[0].outcome).toBe('allowed');
    expect(typeof telemetry[0].metadata?.latencyMs).toBe('number');
  });
});
