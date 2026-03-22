/**
 * Integration — Policy flow
 *
 * Wires real EventRouter + real access.policy + real command.router
 * against an inline mock assistantService and MemoryStore.
 * No LLM calls are made.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventRouter } from '../../src/core/event.router.js';
import { MemoryStore } from '../../src/store/memory.store.js';
import { initTodoLedger } from '../../src/todo.js';
import { auditService } from '../../src/audit/audit.service.js';
import type { IngressEvent } from '../../src/contracts.js';

const OWNER = 'U_OWNER';

function makeEvent(overrides: Partial<IngressEvent> = {}): IngressEvent {
  return {
    id: 'EVT1',
    source: 'slack',
    actorId: OWNER,
    channelId: 'C_GENERAL',
    conversationId: 'C_GENERAL:T1',
    text: 'hello',
    ts: '1000',
    ...overrides,
  };
}

function makeRouter(configOverrides: Record<string, unknown> = {}) {
  const assistantService = { handle: vi.fn().mockResolvedValue('assistant ok') };
  const router = new EventRouter({
    ownerUserId: OWNER,
    allowConversationsWithOthers: false,
    allowDmFromOthers: false,
    allowMentionsFromOthers: false,
    allowedUserIds: [],
    allowedChannelIds: [],
    assistantService,
    ...configOverrides,
  });
  return { router, assistantService };
}

describe('Policy flow — integration', () => {
  beforeEach(() => {
    initTodoLedger(new MemoryStore());
    auditService.clearLog();
    vi.clearAllMocks();
  });

  it('owner request passes through to assistant', async () => {
    const { router, assistantService } = makeRouter();
    const replies: string[] = [];
    await router.route(makeEvent({ actorId: OWNER }), async (t) => { replies.push(t); });
    expect(assistantService.handle).toHaveBeenCalledOnce();
    expect(replies[0]).toBe('assistant ok');
  });

  it('non-owner slack request is denied when conversations with others are disabled', async () => {
    const { router, assistantService } = makeRouter();
    const replies: string[] = [];
    await router.route(
      makeEvent({ actorId: 'U_STRANGER', source: 'slack', channelId: 'C_GENERAL' }),
      async (t) => { replies.push(t); },
    );
    expect(assistantService.handle).not.toHaveBeenCalled();
    expect(replies[0]).toContain('conversations with others are disabled');
  });

  it('access.denied audit event is emitted for non-owner', async () => {
    const { router } = makeRouter();
    await router.route(
      makeEvent({ actorId: 'U_STRANGER', source: 'slack' }),
      async () => {},
    );
    const denied = auditService.getLog().filter(e => e.event_type === 'access.denied');
    expect(denied).toHaveLength(1);
    expect(denied[0].outcome).toBe('denied');
    expect(denied[0].actor_id).toBe('U_STRANGER');
    expect(denied[0].correlation_id).toBeTruthy();
  });

  it('CLI source is always trusted regardless of access flags', async () => {
    const { router, assistantService } = makeRouter();
    const replies: string[] = [];
    await router.route(
      makeEvent({ actorId: 'U_STRANGER', source: 'cli' }),
      async (t) => { replies.push(t); },
    );
    expect(assistantService.handle).toHaveBeenCalledOnce();
    expect(replies[0]).toBe('assistant ok');
  });

  it('non-owner is allowed when allowConversationsWithOthers + allowMentionsFromOthers are true', async () => {
    const { router, assistantService } = makeRouter({
      allowConversationsWithOthers: true,
      allowMentionsFromOthers: true,
    });
    const replies: string[] = [];
    await router.route(
      makeEvent({ actorId: 'U_GUEST', source: 'slack', channelId: 'C_GENERAL' }),
      async (t) => { replies.push(t); },
    );
    expect(assistantService.handle).toHaveBeenCalledOnce();
    expect(replies[0]).toBe('assistant ok');
  });

  it('empty ownerUserId denies all requests with diagnostic reason', async () => {
    const { router, assistantService } = makeRouter({ ownerUserId: '' });
    const replies: string[] = [];
    await router.route(makeEvent({ actorId: OWNER }), async (t) => { replies.push(t); });
    expect(assistantService.handle).not.toHaveBeenCalled();
    expect(replies[0]).toContain('owner identity not configured');
  });
});
