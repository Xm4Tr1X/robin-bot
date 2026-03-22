/**
 * Integration — MCP tool integration (Phase J)
 *
 * Verifies the end-to-end path from MCPService.getEnabledConnections()
 * through AssistantService into the RunnerRequest so the agent SDK
 * receives the correct MCP server configuration.
 *
 * Uses a real MCPService + MemoryStore and a mock RunnerClient that
 * captures the request it receives.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AssistantService } from '../../src/core/assistant.service.js';
import { MCPService } from '../../src/features/mcp/mcp.service.js';
import { MemoryService } from '../../src/memory/memory.service.js';
import { MemoryStore } from '../../src/store/memory.store.js';
import { initTodoLedger } from '../../src/todo.js';
import { auditService } from '../../src/audit/audit.service.js';
import type { IngressEvent, RunnerRequest } from '../../src/contracts.js';

function makeEvent(text = 'hello'): IngressEvent {
  return {
    id: 'MCP_J_1',
    source: 'cli',
    actorId: 'U_OWNER',
    conversationId: 'C_MCPJ:T1',
    text,
    ts: '5000',
  };
}

function makeRunnerClient() {
  let lastRequest: RunnerRequest | null = null;
  const run = vi.fn().mockImplementation((req: RunnerRequest) => {
    lastRequest = req;
    return Promise.resolve({
      requestId: req.requestId,
      sessionId: 'S_MCP',
      text: 'tool response',
      toolTrace: [],
    });
  });
  return { run, getLastRequest: () => lastRequest };
}

describe('MCP tool integration — Phase J', () => {
  let mcpService: MCPService;
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
    mcpService = new MCPService(store);
    initTodoLedger(new MemoryStore());
    auditService.clearLog();
    vi.clearAllMocks();
  });

  it('enabled MCP connections are included in the RunnerRequest', async () => {
    // Register and fully enable a GitHub connection
    const conn = mcpService.add('GitHub', 'https://api.github.com/mcp');
    mcpService.validate(conn.id);
    mcpService.test(conn.id);
    mcpService.enable(conn.id);

    const runner = makeRunnerClient();
    const svc = new AssistantService({
      allowedTools: [],
      memoryService: new MemoryService(new MemoryStore()),
      runnerClient: runner,
      mcpService,
    });

    await svc.handle(makeEvent());

    const req = runner.getLastRequest()!;
    expect(req.mcpServers).toHaveLength(1);
    expect(req.mcpServers![0].name).toBe('GitHub');
    expect(req.mcpServers![0].endpoint).toBe('https://api.github.com/mcp');
  });

  it('multiple enabled connections are all included', async () => {
    for (const [name, endpoint] of [
      ['GitHub', 'https://api.github.com/mcp'],
      ['Slack', 'https://slack.example.com/mcp'],
    ]) {
      const c = mcpService.add(name, endpoint);
      mcpService.validate(c.id);
      mcpService.test(c.id);
      mcpService.enable(c.id);
    }

    const runner = makeRunnerClient();
    const svc = new AssistantService({
      allowedTools: [],
      memoryService: new MemoryService(new MemoryStore()),
      runnerClient: runner,
      mcpService,
    });

    await svc.handle(makeEvent());

    const names = runner.getLastRequest()!.mcpServers!.map(s => s.name).sort();
    expect(names).toEqual(['GitHub', 'Slack']);
  });

  it('disabled connections are excluded from the RunnerRequest', async () => {
    const conn = mcpService.add('GitHub', 'https://api.github.com/mcp');
    mcpService.validate(conn.id);
    mcpService.test(conn.id);
    mcpService.enable(conn.id);
    mcpService.disable(conn.id); // disabled after enable

    const runner = makeRunnerClient();
    const svc = new AssistantService({
      allowedTools: [],
      memoryService: new MemoryService(new MemoryStore()),
      runnerClient: runner,
      mcpService,
    });

    await svc.handle(makeEvent());

    expect(runner.getLastRequest()!.mcpServers).toBeUndefined();
  });

  it('pending/validated/tested (non-enabled) connections are excluded', async () => {
    const conn = mcpService.add('GitHub', 'https://api.github.com/mcp');
    mcpService.validate(conn.id);
    mcpService.test(conn.id);
    // NOT enabled

    const runner = makeRunnerClient();
    const svc = new AssistantService({
      allowedTools: [],
      memoryService: new MemoryService(new MemoryStore()),
      runnerClient: runner,
      mcpService,
    });

    await svc.handle(makeEvent());

    expect(runner.getLastRequest()!.mcpServers).toBeUndefined();
  });

  it('no mcpService injected → mcpServers is undefined in RunnerRequest', async () => {
    const runner = makeRunnerClient();
    const svc = new AssistantService({
      allowedTools: [],
      memoryService: new MemoryService(new MemoryStore()),
      runnerClient: runner,
      // no mcpService
    });

    await svc.handle(makeEvent());

    expect(runner.getLastRequest()!.mcpServers).toBeUndefined();
  });

  it('newly enabled connection is picked up on the next handle() call without restart', async () => {
    const conn = mcpService.add('GitHub', 'https://api.github.com/mcp');
    mcpService.validate(conn.id);
    mcpService.test(conn.id);

    const runner = makeRunnerClient();
    const svc = new AssistantService({
      allowedTools: [],
      memoryService: new MemoryService(new MemoryStore()),
      runnerClient: runner,
      mcpService,
    });

    // First call — not yet enabled
    await svc.handle(makeEvent('first'));
    expect(runner.getLastRequest()!.mcpServers).toBeUndefined();

    // Enable the connection between calls
    mcpService.enable(conn.id);

    // Second call — should now include the server
    await svc.handle(makeEvent('second'));
    expect(runner.getLastRequest()!.mcpServers).toHaveLength(1);
    expect(runner.getLastRequest()!.mcpServers![0].name).toBe('GitHub');
  });
});
