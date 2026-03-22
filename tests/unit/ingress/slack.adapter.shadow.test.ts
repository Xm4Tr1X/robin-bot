/**
 * J3 — Slack adapter shadow channel listener tests.
 *
 * Verifies that channel messages from the owner in configured
 * shadowChannels emit IngressEvents with source 'slack_shadow',
 * while all other channel messages are ignored.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IngressEvent } from '../../../src/contracts.js';

type Handler = (args: unknown) => Promise<void>;

const mockHandlers: { message?: Handler; [key: string]: Handler | undefined } = {};

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

import { SlackAdapter } from '../../../src/ingress/slack.adapter.js';

const TOKEN = 'xoxb-test';
const APP_TOKEN = 'xapp-test';
const OWNER = 'U_OWNER';
const SHADOW_CHANNELS = ['C_SHADOW_1', 'C_SHADOW_2'];

describe('J3: SlackAdapter shadow channel listener', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(mockHandlers)) {
      delete mockHandlers[key];
    }
  });

  it('emits slack_shadow event for owner message in a shadowChannel', async () => {
    const adapter = new SlackAdapter({
      token: TOKEN,
      appToken: APP_TOKEN,
      ownerUserId: OWNER,
      shadowChannels: SHADOW_CHANNELS,
    });
    const received: IngressEvent[] = [];
    await adapter.start(async (ev) => { received.push(ev); });

    const handler = mockHandlers['message'];
    expect(handler).toBeDefined();

    await handler!({
      message: {
        text: 'owner posting in a channel',
        user: OWNER,
        channel: 'C_SHADOW_1',
        channel_type: 'channel',
        ts: '1700000001.000001',
      },
    });

    expect(received).toHaveLength(1);
    expect(received[0].source).toBe('slack_shadow');
    expect(received[0].actorId).toBe(OWNER);
    expect(received[0].channelId).toBe('C_SHADOW_1');
    expect(received[0].text).toBe('owner posting in a channel');
  });

  it('ignores channel message from a non-owner user', async () => {
    const adapter = new SlackAdapter({
      token: TOKEN,
      appToken: APP_TOKEN,
      ownerUserId: OWNER,
      shadowChannels: SHADOW_CHANNELS,
    });
    const received: IngressEvent[] = [];
    await adapter.start(async (ev) => { received.push(ev); });

    await mockHandlers['message']!({
      message: {
        text: 'someone else posting',
        user: 'U_SOMEONE_ELSE',
        channel: 'C_SHADOW_1',
        channel_type: 'channel',
        ts: '1700000001.000001',
      },
    });

    expect(received).toHaveLength(0);
  });

  it('ignores owner message in a channel NOT in shadowChannels', async () => {
    const adapter = new SlackAdapter({
      token: TOKEN,
      appToken: APP_TOKEN,
      ownerUserId: OWNER,
      shadowChannels: SHADOW_CHANNELS,
    });
    const received: IngressEvent[] = [];
    await adapter.start(async (ev) => { received.push(ev); });

    await mockHandlers['message']!({
      message: {
        text: 'owner in non-shadow channel',
        user: OWNER,
        channel: 'C_NOT_SHADOW',
        channel_type: 'channel',
        ts: '1700000001.000001',
      },
    });

    expect(received).toHaveLength(0);
  });

  it('ignores bot messages even if channel matches shadowChannels', async () => {
    const adapter = new SlackAdapter({
      token: TOKEN,
      appToken: APP_TOKEN,
      ownerUserId: OWNER,
      shadowChannels: SHADOW_CHANNELS,
    });
    const received: IngressEvent[] = [];
    await adapter.start(async (ev) => { received.push(ev); });

    await mockHandlers['message']!({
      message: {
        text: 'bot message',
        user: OWNER,
        bot_id: 'B_SOMEBOT',
        channel: 'C_SHADOW_1',
        channel_type: 'channel',
        ts: '1700000001.000001',
      },
    });

    expect(received).toHaveLength(0);
  });

  it('preserves threadTs in the emitted shadow event metadata', async () => {
    const adapter = new SlackAdapter({
      token: TOKEN,
      appToken: APP_TOKEN,
      ownerUserId: OWNER,
      shadowChannels: SHADOW_CHANNELS,
    });
    const received: IngressEvent[] = [];
    await adapter.start(async (ev) => { received.push(ev); });

    await mockHandlers['message']!({
      message: {
        text: 'owner reply in thread',
        user: OWNER,
        channel: 'C_SHADOW_2',
        channel_type: 'channel',
        ts: '1700000002.000001',
        thread_ts: '1700000000.000001',
      },
    });

    expect(received).toHaveLength(1);
    expect(received[0].threadId).toBe('1700000000.000001');
    expect(received[0].metadata?.threadTs).toBe('1700000000.000001');
  });

  it('still processes DMs normally (source=slack) even with shadowChannels configured', async () => {
    const adapter = new SlackAdapter({
      token: TOKEN,
      appToken: APP_TOKEN,
      ownerUserId: OWNER,
      shadowChannels: SHADOW_CHANNELS,
    });
    const received: IngressEvent[] = [];
    await adapter.start(async (ev) => { received.push(ev); });

    await mockHandlers['message']!({
      message: {
        text: 'direct message',
        user: 'U_SOMEONE',
        channel: 'D_DM',
        channel_type: 'im',
        ts: '1700000001.000001',
      },
    });

    expect(received).toHaveLength(1);
    expect(received[0].source).toBe('slack');
  });

  it('emits shadow events for all configured shadow channels', async () => {
    const adapter = new SlackAdapter({
      token: TOKEN,
      appToken: APP_TOKEN,
      ownerUserId: OWNER,
      shadowChannels: SHADOW_CHANNELS,
    });
    const received: IngressEvent[] = [];
    await adapter.start(async (ev) => { received.push(ev); });

    for (const ch of SHADOW_CHANNELS) {
      await mockHandlers['message']!({
        message: {
          text: `message in ${ch}`,
          user: OWNER,
          channel: ch,
          channel_type: 'channel',
          ts: '1700000001.000001',
        },
      });
    }

    expect(received).toHaveLength(2);
    expect(received.every((e) => e.source === 'slack_shadow')).toBe(true);
  });

  it('emits no shadow events when shadowChannels is empty', async () => {
    const adapter = new SlackAdapter({
      token: TOKEN,
      appToken: APP_TOKEN,
      ownerUserId: OWNER,
      shadowChannels: [],
    });
    const received: IngressEvent[] = [];
    await adapter.start(async (ev) => { received.push(ev); });

    await mockHandlers['message']!({
      message: {
        text: 'owner message',
        user: OWNER,
        channel: 'C_ANY',
        channel_type: 'channel',
        ts: '1700000001.000001',
      },
    });

    expect(received).toHaveLength(0);
  });
});
