/**
 * Thread context + thread continuation tests for SlackAdapter.
 *
 * Fix 1: when @mention happens inside a thread, fetch thread context via
 *         conversations.replies and attach to event.metadata.threadMessages
 *
 * Fix 2: after Robin has replied in a thread (session exists for that
 *         conversationId), subsequent messages in that thread without
 *         @mention should still reach Robin as source:'slack'
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IngressEvent } from '../../../src/contracts.js';

type Handler = (args: unknown) => Promise<void>;

const mockHandlers: { [key: string]: Handler | undefined } = {};

const mockConversationsReplies = vi.fn();

const mockApp = {
  event: vi.fn((eventType: string, handler: Handler) => {
    mockHandlers[`event:${eventType}`] = handler;
  }),
  message: vi.fn((handler: Handler) => {
    mockHandlers['message'] = handler;
  }),
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  client: {
    conversations: {
      replies: mockConversationsReplies,
    },
  },
};

vi.mock('@slack/bolt', () => ({ App: vi.fn(() => mockApp) }));

// Mock thread fetcher
vi.mock('../../../src/shadow/thread.fetcher.js', () => ({
  fetchThreadContext: vi.fn(),
}));

import { SlackAdapter } from '../../../src/ingress/slack.adapter.js';
import { fetchThreadContext } from '../../../src/shadow/thread.fetcher.js';

const TOKEN = 'xoxb-test';
const APP_TOKEN = 'xapp-test';
const OWNER = 'U_OWNER';

describe('Fix 1: Thread context fetched on @mention in thread', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(mockHandlers)) delete mockHandlers[key];
    vi.mocked(fetchThreadContext).mockResolvedValue([]);
  });

  it('calls fetchThreadContext when app_mention has thread_ts', async () => {
    vi.mocked(fetchThreadContext).mockResolvedValue(['alert: p99 latency spike at 3am', 'looks serious']);

    const adapter = new SlackAdapter({ token: TOKEN, appToken: APP_TOKEN, ownerUserId: OWNER });
    const received: IngressEvent[] = [];
    await adapter.start(async (ev) => { received.push(ev); });

    await mockHandlers['event:app_mention']!({
      event: {
        text: '<@BOT> check this',
        user: OWNER,
        channel: 'C_GENERAL',
        ts: '1700000002.000001',
        thread_ts: '1700000000.000001',
      },
    });

    expect(fetchThreadContext).toHaveBeenCalledWith(
      expect.anything(),
      'C_GENERAL',
      '1700000000.000001',
      { includeBots: true },
    );
  });

  it('attaches thread messages to event metadata', async () => {
    vi.mocked(fetchThreadContext).mockResolvedValue(['alert: p99 latency spike', 'logs show timeout']);

    const adapter = new SlackAdapter({ token: TOKEN, appToken: APP_TOKEN, ownerUserId: OWNER });
    const received: IngressEvent[] = [];
    await adapter.start(async (ev) => { received.push(ev); });

    await mockHandlers['event:app_mention']!({
      event: {
        text: '<@BOT> check this',
        user: OWNER,
        channel: 'C_GENERAL',
        ts: '1700000002.000001',
        thread_ts: '1700000000.000001',
      },
    });

    expect(received[0].metadata?.threadMessages).toEqual([
      'alert: p99 latency spike',
      'logs show timeout',
    ]);
  });

  it('does NOT call fetchThreadContext when there is no thread_ts', async () => {
    const adapter = new SlackAdapter({ token: TOKEN, appToken: APP_TOKEN, ownerUserId: OWNER });
    await adapter.start(async () => {});

    await mockHandlers['event:app_mention']!({
      event: {
        text: '<@BOT> show todos',
        user: OWNER,
        channel: 'C_GENERAL',
        ts: '1700000002.000001',
      },
    });

    expect(fetchThreadContext).not.toHaveBeenCalled();
  });

  it('emits event even if fetchThreadContext fails', async () => {
    vi.mocked(fetchThreadContext).mockRejectedValue(new Error('Slack API timeout'));

    const adapter = new SlackAdapter({ token: TOKEN, appToken: APP_TOKEN, ownerUserId: OWNER });
    const received: IngressEvent[] = [];
    await adapter.start(async (ev) => { received.push(ev); });

    await mockHandlers['event:app_mention']!({
      event: {
        text: '<@BOT> check this',
        user: OWNER,
        channel: 'C_GENERAL',
        ts: '1700000002.000001',
        thread_ts: '1700000000.000001',
      },
    });

    expect(received).toHaveLength(1);
    expect(received[0].text).toBe('check this');
  });
});

describe('Thread continuation removed — @mention required on every message', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(mockHandlers)) delete mockHandlers[key];
    vi.mocked(fetchThreadContext).mockResolvedValue([]);
  });

  it('channel thread message without @mention is ignored (prevents false triggers when others are tagged)', async () => {
    const adapter = new SlackAdapter({ token: TOKEN, appToken: APP_TOKEN, ownerUserId: OWNER });
    const received: IngressEvent[] = [];
    await adapter.start(async (ev) => { received.push(ev); });

    await mockHandlers['message']!({
      message: {
        text: 'looks like a db issue @someone-else',
        user: OWNER,
        channel: 'C_GENERAL',
        channel_type: 'channel',
        ts: '1700000003.000001',
        thread_ts: '1700000000.000001',
      },
    });

    expect(received).toHaveLength(0);
  });

  it('DMs still work without @mention', async () => {
    const adapter = new SlackAdapter({ token: TOKEN, appToken: APP_TOKEN, ownerUserId: OWNER });
    const received: IngressEvent[] = [];
    await adapter.start(async (ev) => { received.push(ev); });

    await mockHandlers['message']!({
      message: {
        text: 'direct message',
        user: OWNER,
        channel: 'D_DM',
        channel_type: 'im',
        ts: '1700000003.000001',
      },
    });

    expect(received).toHaveLength(1);
    expect(received[0].source).toBe('slack');
  });
});
