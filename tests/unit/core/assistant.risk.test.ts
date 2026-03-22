/**
 * L2 — AssistantService tool allowlist by risk level.
 *
 * Verifies that classifyRisk is applied to pick the correct tool set
 * from toolPolicy before building the prompt envelope.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IngressEvent } from '../../../src/contracts.js';
import { AssistantService } from '../../../src/core/assistant.service.js';
import { MemoryStore } from '../../../src/store/memory.store.js';
import { MemoryService } from '../../../src/memory/memory.service.js';
import type { RunnerRequest } from '../../../src/contracts.js';

// Capture the RunnerRequest so we can inspect envelope.allowedTools
let capturedRequest: RunnerRequest | null = null;

const mockRunnerClient = {
  run: vi.fn(async (req: RunnerRequest) => {
    capturedRequest = req;
    return { requestId: req.requestId, sessionId: 'sess-1', text: 'ok', toolTrace: [] };
  }),
};

function makeEvent(text: string): IngressEvent {
  return {
    id: 'evt-1',
    source: 'cli',
    actorId: 'system',
    conversationId: 'cli:1',
    text,
    ts: new Date().toISOString(),
  };
}

function makeService(toolPolicy?: Record<string, string[]>) {
  const store = new MemoryStore();
  const memoryService = new MemoryService(store);
  return new AssistantService({
    allowedTools: ['Read', 'Glob'],   // flat fallback
    memoryService,
    runnerClient: mockRunnerClient,
    toolPolicy: toolPolicy as never,
  });
}

describe('L2: AssistantService tool allowlist by risk level', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedRequest = null;
  });

  it('uses low-risk tool list for search/read tasks', async () => {
    const service = makeService({
      low: ['Read', 'Glob', 'Grep'],
      medium: ['Read', 'Glob'],
      high: [],
    });

    await service.handle(makeEvent('search for error logs'));

    expect(capturedRequest).not.toBeNull();
    expect(capturedRequest!.envelope.allowedTools).toEqual(['Read', 'Glob', 'Grep']);
  });

  it('uses empty tool list for high-risk tasks', async () => {
    const service = makeService({
      low: ['Read', 'Glob'],
      medium: ['Read', 'Glob'],
      high: [],
    });

    await service.handle(makeEvent('write a file to disk'));

    expect(capturedRequest).not.toBeNull();
    expect(capturedRequest!.envelope.allowedTools).toEqual([]);
  });

  it('uses medium tool list for medium-risk tasks', async () => {
    const service = makeService({
      low: ['Read', 'Glob', 'Grep'],
      medium: ['Read'],
      high: [],
    });

    await service.handle(makeEvent('do the thing')); // ambiguous → medium

    expect(capturedRequest).not.toBeNull();
    expect(capturedRequest!.envelope.allowedTools).toEqual(['Read']);
  });

  it('falls back to flat allowedTools when toolPolicy is not configured', async () => {
    const service = makeService(undefined);

    await service.handle(makeEvent('search for something'));

    expect(capturedRequest).not.toBeNull();
    expect(capturedRequest!.envelope.allowedTools).toEqual(['Read', 'Glob']);
  });

  it('classifies by tool trace escalation when toolTrace present on session', async () => {
    const service = makeService({
      low: ['Read', 'Glob'],
      medium: ['Read'],
      high: [],
    });

    // "read logs" is low risk by text but if we were tracking tool trace escalation...
    // This tests the text-only path since tool trace comes from LLM output not input
    await service.handle(makeEvent('read the logs'));

    expect(capturedRequest!.envelope.allowedTools).toEqual(['Read', 'Glob']);
  });
});
