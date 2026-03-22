/**
 * J4 — Event router shadow path tests.
 *
 * When source === 'slack_shadow', the router must:
 * - record activity via activityService
 * - never call the reply callback
 * - bypass access policy
 * - bypass command router
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IngressEvent } from '../../../src/contracts.js';
import { EventRouter } from '../../../src/core/event.router.js';
import type { ActivityService } from '../../../src/shadow/activity.service.js';

// Minimal mock assistant service — must never be called for shadow events
const mockAssistantService = {
  handle: vi.fn().mockResolvedValue({ text: 'response', isDraft: false, toolTrace: [] }),
};

// Minimal mock activity service
function makeActivityService(): ActivityService {
  return {
    record: vi.fn().mockReturnValue({ id: 'rec-1' }),
    listRecent: vi.fn().mockReturnValue([]),
    prune: vi.fn().mockReturnValue(0),
  } as unknown as ActivityService;
}

function makeShadowEvent(overrides: Partial<IngressEvent> = {}): IngressEvent {
  return {
    id: 'evt-shadow-1',
    source: 'slack_shadow',
    actorId: 'U_OWNER',
    channelId: 'C_SHADOW',
    conversationId: 'C_SHADOW:1700000001.000001',
    threadId: undefined,
    text: 'owner said something',
    ts: '1700000001.000001',
    ...overrides,
  };
}

function buildRouter(activityService?: ActivityService) {
  return new EventRouter({
    ownerUserId: 'U_OWNER',
    allowConversationsWithOthers: false,
    allowDmFromOthers: false,
    allowMentionsFromOthers: false,
    allowedUserIds: [],
    allowedChannelIds: [],
    assistantService: mockAssistantService,
    activityService,
  });
}

describe('J4: EventRouter shadow path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records activity via activityService when source is slack_shadow', async () => {
    const activityService = makeActivityService();
    const router = buildRouter(activityService);
    const reply = vi.fn();

    await router.route(makeShadowEvent(), reply);

    expect(activityService.record).toHaveBeenCalledOnce();
    const recorded = vi.mocked(activityService.record).mock.calls[0][0];
    expect(recorded.channelId).toBe('C_SHADOW');
    expect(recorded.actorId).toBe('U_OWNER');
    expect(recorded.text).toBe('owner said something');
  });

  it('never calls the reply callback for shadow events', async () => {
    const activityService = makeActivityService();
    const router = buildRouter(activityService);
    const reply = vi.fn();

    await router.route(makeShadowEvent(), reply);

    expect(reply).not.toHaveBeenCalled();
  });

  it('never calls assistantService.handle for shadow events', async () => {
    const activityService = makeActivityService();
    const router = buildRouter(activityService);

    await router.route(makeShadowEvent(), vi.fn());

    expect(mockAssistantService.handle).not.toHaveBeenCalled();
  });

  it('bypasses access policy — shadow event from unknown actor is still recorded', async () => {
    const activityService = makeActivityService();
    const router = buildRouter(activityService);
    const reply = vi.fn();

    // Non-owner actor — would be denied by access policy if it got that far
    const evt = makeShadowEvent({ actorId: 'U_UNKNOWN' });
    await router.route(evt, reply);

    // Should still record and never reply
    expect(activityService.record).toHaveBeenCalledOnce();
    expect(reply).not.toHaveBeenCalled();
  });

  it('drops shadow event silently when no activityService is configured', async () => {
    const router = buildRouter(undefined); // no activityService
    const reply = vi.fn();

    // Should not throw and should not reply
    await expect(router.route(makeShadowEvent(), reply)).resolves.toBeUndefined();
    expect(reply).not.toHaveBeenCalled();
  });

  it('preserves threadTs in the recorded activity', async () => {
    const activityService = makeActivityService();
    const router = buildRouter(activityService);

    const evt = makeShadowEvent({
      threadId: '1700000000.000001',
      metadata: { threadTs: '1700000000.000001' },
    });
    await router.route(evt, vi.fn());

    const recorded = vi.mocked(activityService.record).mock.calls[0][0];
    expect(recorded.threadTs).toBe('1700000000.000001');
  });

  it('does not affect non-shadow events — they still go through the normal path', async () => {
    const activityService = makeActivityService();
    const router = buildRouter(activityService);
    const reply = vi.fn();

    const normalEvent: IngressEvent = {
      id: 'evt-1',
      source: 'cli',
      actorId: 'system',
      conversationId: 'cli:1',
      text: 'show todos',
      ts: '1700000001.000001',
    };

    await router.route(normalEvent, reply);

    // Activity service should NOT be called for normal events
    expect(activityService.record).not.toHaveBeenCalled();
    // Reply should be called (command was handled)
    expect(reply).toHaveBeenCalled();
  });
});
