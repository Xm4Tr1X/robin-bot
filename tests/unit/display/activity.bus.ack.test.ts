/**
 * Checking acknowledgement — when runner_start fires for a Slack event,
 * the Slack adapter must post "Checking…" to the thread before the LLM
 * response arrives, so the user knows Robin is online and working.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { activityBus } from '../../../src/display/activity.bus.js';

describe('Slack checking acknowledgement via ActivityBus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runner_start event carries source, channel, and threadId', () => {
    const received: unknown[] = [];
    const unsub = activityBus.subscribe((e) => received.push(e));

    activityBus.emit({
      kind: 'runner_start',
      source: 'slack',
      channel: 'C07MANA350F',
      threadId: '1774010142.629699',
      displayName: 'sonnet · claude',
    });

    expect(received).toHaveLength(1);
    const evt = received[0] as { source?: string; channel?: string; threadId?: string };
    expect(evt.source).toBe('slack');
    expect(evt.channel).toBe('C07MANA350F');
    expect(evt.threadId).toBe('1774010142.629699');

    unsub();
  });

  it('runner_start from CLI does not carry Slack channel', () => {
    const received: unknown[] = [];
    const unsub = activityBus.subscribe((e) => received.push(e));

    activityBus.emit({
      kind: 'runner_start',
      source: 'cli',
      displayName: 'kimi-k2p5 · fireworks',
    });

    const evt = received[0] as { source?: string; channel?: string };
    expect(evt.source).toBe('cli');
    expect(evt.channel).toBeUndefined();

    unsub();
  });

  it('subscriber only posts ack when source is slack and channel is set', () => {
    const mockPostAck = vi.fn();

    const unsub = activityBus.subscribe((e) => {
      if (e.kind === 'runner_start' && e.source === 'slack' && e.channel) {
        mockPostAck(e.channel, e.threadId);
      }
    });

    // CLI event — should NOT trigger ack
    activityBus.emit({ kind: 'runner_start', source: 'cli' });
    expect(mockPostAck).not.toHaveBeenCalled();

    // Slack event — SHOULD trigger ack
    activityBus.emit({
      kind: 'runner_start',
      source: 'slack',
      channel: 'C07MANA350F',
      threadId: '1774010142.629699',
    });
    expect(mockPostAck).toHaveBeenCalledWith('C07MANA350F', '1774010142.629699');

    unsub();
  });
});
