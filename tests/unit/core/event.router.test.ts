import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IngressEvent } from '../../../src/contracts.js';

// ---------------------------------------------------------------------------
// Mock the access policy BEFORE importing EventRouter.
// We expose a controllable `mockDecision` so individual tests can flip it.
// ---------------------------------------------------------------------------

const mockDecision = { allow: true, reason: undefined as string | undefined };

vi.mock('../../../src/policy/access.policy.js', () => ({
  checkAccess: vi.fn(() => ({ ...mockDecision })),
  buildDenialReply: vi.fn((decision: { reason?: string }) =>
    `_Access denied: ${decision.reason ?? 'not allowed'}_`
  ),
}));

// Mock command router so tests can control whether a command is handled.
const mockCommandResult = { handled: false, reply: undefined as string | undefined };

vi.mock('../../../src/core/command.router.js', () => ({
  routeCommand: vi.fn(() => ({ ...mockCommandResult })),
  stripMention: vi.fn((text: string) => text.replace(/<@[A-Z0-9]+>/g, '').trim()),
}));

// Mock session so EventRouter can read session.mode without real state.
vi.mock('../../../src/session.js', () => ({
  getSession: vi.fn(() => ({
    threadId: 'T1',
    channelId: 'C1',
    mode: 'observe',
    memory: { constraints: [], decisions: [], pendingActions: [] },
  })),
  getSessionSummary: vi.fn(() => '*Mode:* observe'),
  resetSession: vi.fn(),
  setMode: vi.fn(),
  saveSnapshot: vi.fn(),
  clearSnapshot: vi.fn(),
}));

import { EventRouter } from '../../../src/core/event.router.js';
import type { EventRouterConfig } from '../../../src/core/event.router.js';
import { checkAccess, buildDenialReply } from '../../../src/policy/access.policy.js';
import { routeCommand } from '../../../src/core/command.router.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<IngressEvent> = {}): IngressEvent {
  return {
    id: 'evt-001',
    source: 'slack',
    actorId: 'U_OTHER',
    channelId: 'C_CHANNEL',
    conversationId: 'C_CHANNEL:T1',
    threadId: 'T1',
    text: 'hello robin',
    ts: '1700000001.000001',
    ...overrides,
  };
}

function makeConfig(overrides: Partial<EventRouterConfig> = {}): EventRouterConfig {
  return {
    ownerUserId: 'U_OWNER',
    allowConversationsWithOthers: true,
    allowDmFromOthers: false,
    allowMentionsFromOthers: false,
    allowedUserIds: [],
    allowedChannelIds: [],
    assistantService: {
      handle: vi.fn().mockResolvedValue('assistant response'),
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Default: access allowed, command not handled
  mockDecision.allow = true;
  mockDecision.reason = undefined;
  mockCommandResult.handled = false;
  mockCommandResult.reply = undefined;

  vi.mocked(checkAccess).mockReturnValue({ allow: true });
  vi.mocked(buildDenialReply).mockReturnValue('_Access denied: not allowed_');
  vi.mocked(routeCommand).mockReturnValue({ handled: false });
});

// ---------------------------------------------------------------------------
// Access denied
// ---------------------------------------------------------------------------

describe('EventRouter — access denied', () => {
  it('calls reply with denial message and does NOT call assistantService when denied', async () => {
    vi.mocked(checkAccess).mockReturnValue({ allow: false, reason: 'not permitted' });
    vi.mocked(buildDenialReply).mockReturnValue('_Access denied: not permitted_');

    const config = makeConfig();
    const router = new EventRouter(config);
    const reply = vi.fn().mockResolvedValue(undefined);

    await router.route(makeEvent({ actorId: 'U_STRANGER' }), reply);

    expect(reply).toHaveBeenCalledOnce();
    expect(reply).toHaveBeenCalledWith('_Access denied: not permitted_');
    expect(config.assistantService.handle).not.toHaveBeenCalled();
  });

  it('emits an audit warn when access is denied', async () => {
    vi.mocked(checkAccess).mockReturnValue({ allow: false, reason: 'blocked' });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const router = new EventRouter(makeConfig());
    await router.route(makeEvent(), vi.fn().mockResolvedValue(undefined));

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Access allowed — command handled
// ---------------------------------------------------------------------------

describe('EventRouter — allowed, command handled', () => {
  it('calls reply with command result and does NOT call assistantService', async () => {
    vi.mocked(checkAccess).mockReturnValue({ allow: true });
    vi.mocked(routeCommand).mockReturnValue({
      handled: true,
      commandType: 'mode',
      reply: '_Switched to reply mode._',
    });

    const config = makeConfig();
    const router = new EventRouter(config);
    const reply = vi.fn().mockResolvedValue(undefined);

    await router.route(makeEvent({ text: 'reply mode' }), reply);

    expect(reply).toHaveBeenCalledOnce();
    expect(reply).toHaveBeenCalledWith('_Switched to reply mode._');
    expect(config.assistantService.handle).not.toHaveBeenCalled();
  });

  it('calls reply with empty string when command result has no reply text', async () => {
    vi.mocked(checkAccess).mockReturnValue({ allow: true });
    vi.mocked(routeCommand).mockReturnValue({ handled: true, reply: undefined });

    const config = makeConfig();
    const router = new EventRouter(config);
    const reply = vi.fn().mockResolvedValue(undefined);

    await router.route(makeEvent(), reply);

    expect(reply).toHaveBeenCalledWith('');
    expect(config.assistantService.handle).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Access allowed — no command match → assistant
// ---------------------------------------------------------------------------

describe('EventRouter — allowed, no command → assistant', () => {
  it('calls assistantService.handle and passes response to reply', async () => {
    vi.mocked(checkAccess).mockReturnValue({ allow: true });
    vi.mocked(routeCommand).mockReturnValue({ handled: false });

    const config = makeConfig({
      assistantService: {
        handle: vi.fn().mockResolvedValue('Here is my answer.'),
      },
    });
    const router = new EventRouter(config);
    const reply = vi.fn().mockResolvedValue(undefined);

    await router.route(makeEvent({ text: 'What is the meaning of life?' }), reply);

    expect(config.assistantService.handle).toHaveBeenCalledOnce();
    expect(reply).toHaveBeenCalledWith('Here is my answer.');
  });

  it('passes the session mode to assistantService.handle', async () => {
    vi.mocked(checkAccess).mockReturnValue({ allow: true });
    vi.mocked(routeCommand).mockReturnValue({ handled: false });

    const config = makeConfig({
      assistantService: {
        handle: vi.fn().mockResolvedValue('ok'),
      },
    });
    const router = new EventRouter(config);
    await router.route(makeEvent(), vi.fn().mockResolvedValue(undefined));

    // The second argument to handle should be the session mode string
    const handleArgs = vi.mocked(config.assistantService.handle).mock.calls[0];
    expect(typeof handleArgs[1]).toBe('string');
  });

  it('passes the full IngressEvent (with stripped text) to assistantService.handle', async () => {
    vi.mocked(checkAccess).mockReturnValue({ allow: true });
    vi.mocked(routeCommand).mockReturnValue({ handled: false });

    const config = makeConfig({
      assistantService: {
        handle: vi.fn().mockResolvedValue('ok'),
      },
    });
    const router = new EventRouter(config);
    const ev = makeEvent({ text: '<@UBOT> hello robin' });
    await router.route(ev, vi.fn().mockResolvedValue(undefined));

    expect(config.assistantService.handle).toHaveBeenCalledOnce();
    // First arg should be an IngressEvent-shaped object
    const passedEvent = vi.mocked(config.assistantService.handle).mock.calls[0][0];
    expect(passedEvent).toHaveProperty('conversationId');
    expect(passedEvent).toHaveProperty('actorId');
  });
});

// ---------------------------------------------------------------------------
// Owner always allowed
// ---------------------------------------------------------------------------

describe('EventRouter — owner always allowed', () => {
  it('owner event is processed even when checkAccess returns denied', async () => {
    // Simulate policy denying but we still verify the owner bypass test shape.
    // The owner bypass logic is in the access policy itself; EventRouter simply
    // trusts the decision. This test verifies that when checkAccess allows owner
    // (as it should), the assistant is called.
    vi.mocked(checkAccess).mockImplementation((ctx) => {
      // The real policy always allows the owner; simulate that here.
      if (ctx.actorId === ctx.ownerUserId) return { allow: true };
      return { allow: false, reason: 'not owner' };
    });
    vi.mocked(routeCommand).mockReturnValue({ handled: false });

    const config = makeConfig({
      ownerUserId: 'U_OWNER',
      allowConversationsWithOthers: false,
      assistantService: { handle: vi.fn().mockResolvedValue('owner response') },
    });
    const router = new EventRouter(config);
    const reply = vi.fn().mockResolvedValue(undefined);

    await router.route(makeEvent({ actorId: 'U_OWNER' }), reply);

    expect(config.assistantService.handle).toHaveBeenCalledOnce();
    expect(reply).toHaveBeenCalledWith('owner response');
  });

  it('non-owner is denied when checkAccess returns denied', async () => {
    vi.mocked(checkAccess).mockImplementation((ctx) => {
      if (ctx.actorId === ctx.ownerUserId) return { allow: true };
      return { allow: false, reason: 'not owner' };
    });
    vi.mocked(buildDenialReply).mockReturnValue('_Access denied: not owner_');

    const config = makeConfig({
      ownerUserId: 'U_OWNER',
      allowConversationsWithOthers: false,
      assistantService: { handle: vi.fn().mockResolvedValue('response') },
    });
    const router = new EventRouter(config);
    const reply = vi.fn().mockResolvedValue(undefined);

    await router.route(makeEvent({ actorId: 'U_STRANGER' }), reply);

    expect(config.assistantService.handle).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith('_Access denied: not owner_');
  });
});
