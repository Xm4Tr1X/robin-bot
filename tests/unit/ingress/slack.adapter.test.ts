import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IngressEvent } from '../../../src/contracts.js';

// ---------------------------------------------------------------------------
// Mock @slack/bolt BEFORE importing the adapter so the mock is in place.
// We capture the handlers registered via app.message() and app.event() so we
// can invoke them directly in tests.
// ---------------------------------------------------------------------------

type Handler = (args: unknown) => Promise<void>;

const mockHandlers: Record<string, Handler> = {};

const mockApp = {
  event: vi.fn((eventType: string, handler: Handler) => {
    mockHandlers[`event:${eventType}`] = handler;
  }),
  message: vi.fn((handler: Handler) => {
    mockHandlers['message'] = handler;
  }),
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
};

vi.mock('@slack/bolt', () => ({
  App: vi.fn(() => mockApp),
}));

// Import adapter AFTER mock is set up
import { SlackAdapter, stripSlackMention } from '../../../src/ingress/slack.adapter.js';

// ---------------------------------------------------------------------------
// stripSlackMention — pure function tests
// ---------------------------------------------------------------------------

describe('stripSlackMention', () => {
  it('removes a single <@U123> mention from text', () => {
    expect(stripSlackMention('<@U123> hello world')).toBe('hello world');
  });

  it('handles multiple mentions', () => {
    expect(stripSlackMention('<@U123> <@UABC> do this')).toBe('do this');
  });

  it('returns original text when there are no mentions', () => {
    expect(stripSlackMention('just plain text')).toBe('just plain text');
  });
});

// ---------------------------------------------------------------------------
// SlackAdapter — event shape tests
// ---------------------------------------------------------------------------

describe('SlackAdapter', () => {
  const TOKEN = 'xoxb-test';
  const APP_TOKEN = 'xapp-test';
  const OWNER = 'U_OWNER';

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset captured handlers between tests
    for (const key of Object.keys(mockHandlers)) {
      delete mockHandlers[key];
    }
  });

  it('calls onEvent with correct IngressEvent shape on app_mention', async () => {
    const adapter = new SlackAdapter({ token: TOKEN, appToken: APP_TOKEN, ownerUserId: OWNER });
    const received: IngressEvent[] = [];
    await adapter.start(async (ev) => { received.push(ev); });

    // Simulate the app_mention handler being triggered
    const handler = mockHandlers['event:app_mention'];
    expect(handler, 'app_mention handler should be registered').toBeDefined();

    await handler({
      event: {
        text: '<@UBOTID> hello there',
        user: 'U_ACTOR',
        channel: 'C_CHANNEL',
        ts: '1700000001.000001',
        thread_ts: '1700000000.000000',
      },
      say: vi.fn(),
    });

    expect(received).toHaveLength(1);
    const ev = received[0];
    expect(ev.source).toBe('slack');
    expect(ev.actorId).toBe('U_ACTOR');
    expect(ev.channelId).toBe('C_CHANNEL');
    expect(ev.threadId).toBe('1700000000.000000');
    expect(ev.conversationId).toBe('C_CHANNEL:1700000000.000000');
    expect(ev.ts).toBe('1700000001.000001');
    expect(typeof ev.id).toBe('string');
    expect(ev.id.length).toBeGreaterThan(0);
  });

  it('strips bot mention from text in the emitted IngressEvent', async () => {
    const adapter = new SlackAdapter({ token: TOKEN, appToken: APP_TOKEN, ownerUserId: OWNER });
    const received: IngressEvent[] = [];
    await adapter.start(async (ev) => { received.push(ev); });

    const handler = mockHandlers['event:app_mention'];
    await handler({
      event: {
        text: '<@UBOTID> do something useful',
        user: 'U_ACTOR',
        channel: 'C_CHANNEL',
        ts: '1700000001.000001',
      },
      say: vi.fn(),
    });

    expect(received[0].text).toBe('do something useful');
  });

  it('uses ts as the conversationId suffix when thread_ts is absent', async () => {
    const adapter = new SlackAdapter({ token: TOKEN, appToken: APP_TOKEN, ownerUserId: OWNER });
    const received: IngressEvent[] = [];
    await adapter.start(async (ev) => { received.push(ev); });

    const handler = mockHandlers['event:app_mention'];
    await handler({
      event: {
        text: '<@UBOTID> no thread',
        user: 'U_ACTOR',
        channel: 'C_CHANNEL',
        ts: '1700000001.000001',
        // no thread_ts
      },
      say: vi.fn(),
    });

    expect(received[0].conversationId).toBe('C_CHANNEL:1700000001.000001');
    expect(received[0].threadId).toBeUndefined();
  });

  it('only processes DMs (channel_type === im) in the message handler', async () => {
    const adapter = new SlackAdapter({ token: TOKEN, appToken: APP_TOKEN, ownerUserId: OWNER });
    const received: IngressEvent[] = [];
    await adapter.start(async (ev) => { received.push(ev); });

    const handler = mockHandlers['message'];
    expect(handler, 'message handler should be registered').toBeDefined();

    // Non-DM: should be ignored
    await handler({
      message: {
        text: 'not a dm',
        user: 'U_ACTOR',
        channel: 'C_CHANNEL',
        channel_type: 'channel',
        ts: '1700000001.000001',
      },
      say: vi.fn(),
    });
    expect(received).toHaveLength(0);

    // DM: should be processed
    await handler({
      message: {
        text: 'direct message text',
        user: 'U_ACTOR',
        channel: 'D_DM_CHANNEL',
        channel_type: 'im',
        ts: '1700000002.000001',
      },
      say: vi.fn(),
    });
    expect(received).toHaveLength(1);
    expect(received[0].source).toBe('slack');
    expect(received[0].text).toBe('direct message text');
  });

  it('stop() calls app.stop()', async () => {
    const adapter = new SlackAdapter({ token: TOKEN, appToken: APP_TOKEN, ownerUserId: OWNER });
    await adapter.start(async () => {});
    await adapter.stop();
    expect(mockApp.stop).toHaveBeenCalledOnce();
  });
});
