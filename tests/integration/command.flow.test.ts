/**
 * Integration — Command routing flow
 *
 * Verifies that deterministic commands are routed without calling the
 * assistant service, and unrecognized text falls through to it.
 * Uses real EventRouter + real routeCommand + real session module.
 * No LLM calls are made.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventRouter } from '../../src/core/event.router.js';
import { MemoryStore } from '../../src/store/memory.store.js';
import { initTodoLedger } from '../../src/todo.js';
import { PolicyService } from '../../src/features/policy/policy.service.js';
import type { IngressEvent } from '../../src/contracts.js';

const OWNER = 'U_OWNER';

function makeEvent(text: string, overrides: Partial<IngressEvent> = {}): IngressEvent {
  return {
    id: 'EVT_CMD',
    source: 'cli',
    actorId: OWNER,
    channelId: 'C1',
    conversationId: 'C1:T_CMD',
    text,
    ts: '2000',
    ...overrides,
  };
}

function makeRouter(extra: Record<string, unknown> = {}) {
  const assistantService = { handle: vi.fn().mockResolvedValue('llm reply') };
  const router = new EventRouter({
    ownerUserId: OWNER,
    allowConversationsWithOthers: false,
    allowDmFromOthers: false,
    allowMentionsFromOthers: false,
    allowedUserIds: [],
    allowedChannelIds: [],
    assistantService,
    ...extra,
  });
  return { router, assistantService };
}

describe('Command routing flow — integration', () => {
  beforeEach(() => {
    initTodoLedger(new MemoryStore());
    vi.clearAllMocks();
  });

  it('"show todos" is handled by command router without calling assistant', async () => {
    const { router, assistantService } = makeRouter();
    const replies: string[] = [];
    await router.route(makeEvent('show todos'), async (t) => { replies.push(t); });
    expect(assistantService.handle).not.toHaveBeenCalled();
    expect(replies).toHaveLength(1);
    // formatForSlack returns some todo content (empty ledger)
    expect(typeof replies[0]).toBe('string');
  });

  it('"mode orchestrated" is handled without calling assistant', async () => {
    const { router, assistantService } = makeRouter();
    const replies: string[] = [];
    await router.route(makeEvent('mode orchestrated'), async (t) => { replies.push(t); });
    expect(assistantService.handle).not.toHaveBeenCalled();
    expect(replies[0]).toContain('orchestrated');
  });

  it('"add todo: Write tests" is handled by command router', async () => {
    const { router, assistantService } = makeRouter();
    const replies: string[] = [];
    await router.route(makeEvent('add todo: Write tests'), async (t) => { replies.push(t); });
    expect(assistantService.handle).not.toHaveBeenCalled();
    expect(replies[0]).toContain('Write tests');
  });

  it('unrecognized text falls through to assistant service', async () => {
    const { router, assistantService } = makeRouter();
    const replies: string[] = [];
    await router.route(makeEvent('tell me a joke'), async (t) => { replies.push(t); });
    expect(assistantService.handle).toHaveBeenCalledOnce();
    expect(replies[0]).toBe('llm reply');
  });

  it('"policy show" is handled by policy command when policyService is provided', async () => {
    const policyService = new PolicyService({
      ownerUserId: OWNER,
      allowConversationsWithOthers: false,
      allowDmFromOthers: false,
      allowMentionsFromOthers: false,
      allowedUserIds: [],
      allowedChannelIds: [],
    });
    const { router, assistantService } = makeRouter({ features: { policyService } });
    const replies: string[] = [];
    await router.route(makeEvent('policy show'), async (t) => { replies.push(t); });
    expect(assistantService.handle).not.toHaveBeenCalled();
    expect(replies[0]).toContain('ownerUserId');
  });
});
