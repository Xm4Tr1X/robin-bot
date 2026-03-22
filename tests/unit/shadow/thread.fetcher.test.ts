/**
 * J5 — ThreadFetcher tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { fetchThreadContext } from '../../../src/shadow/thread.fetcher.js';

function makeClient(messages: unknown[], throws = false) {
  return {
    conversations: {
      replies: throws
        ? vi.fn().mockRejectedValue(new Error('Slack API error'))
        : vi.fn().mockResolvedValue({ messages }),
    },
  };
}

describe('J5: fetchThreadContext', () => {
  it('returns array of message texts from API response', async () => {
    const client = makeClient([
      { text: 'first message', bot_id: undefined },
      { text: 'second message', bot_id: undefined },
    ]);

    const result = await fetchThreadContext(client as never, 'C123', '1700000000.000001');
    expect(result).toEqual(['first message', 'second message']);
  });

  it('filters out bot messages', async () => {
    const client = makeClient([
      { text: 'human message' },
      { text: 'bot reply', bot_id: 'B_SOMEBOT' },
      { text: 'another human message' },
    ]);

    const result = await fetchThreadContext(client as never, 'C123', '1700000000.000001');
    expect(result).toEqual(['human message', 'another human message']);
  });

  it('returns empty array on API error (graceful fallback)', async () => {
    const client = makeClient([], true);
    const result = await fetchThreadContext(client as never, 'C123', '1700000000.000001');
    expect(result).toEqual([]);
  });

  it('returns empty array for empty thread', async () => {
    const client = makeClient([]);
    const result = await fetchThreadContext(client as never, 'C123', '1700000000.000001');
    expect(result).toEqual([]);
  });

  it('skips messages with no text', async () => {
    const client = makeClient([
      { text: 'has text' },
      { bot_id: undefined }, // no text field
      { text: '' }, // empty text
    ]);

    const result = await fetchThreadContext(client as never, 'C123', '1700000000.000001');
    expect(result).toEqual(['has text']);
  });

  // includeBots option — needed for active Slack mentions where the alert is from a bot
  it('includes bot messages when includeBots is true', async () => {
    const client = makeClient([
      { text: 'human message' },
      { text: 'alert: p99 latency spike', bot_id: 'B_CORALOGIX' },
    ]);

    const result = await fetchThreadContext(client as never, 'C123', '1700000000.000001', { includeBots: true });
    expect(result).toEqual(['human message', 'alert: p99 latency spike']);
  });

  it('still filters bot messages by default (shadow path unaffected)', async () => {
    const client = makeClient([
      { text: 'human message' },
      { text: 'bot noise', bot_id: 'B_SOMEBOT' },
    ]);

    const result = await fetchThreadContext(client as never, 'C123', '1700000000.000001');
    expect(result).toEqual(['human message']);
  });
});
