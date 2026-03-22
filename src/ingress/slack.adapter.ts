/**
 * Slack ingress adapter.
 *
 * Bridges the @slack/bolt App into the Robin IngressAdapter contract.
 * Does NOT call the LLM — it only normalises raw Slack events into
 * IngressEvent objects and forwards them to the provided onEvent callback.
 */

import { randomUUID } from 'node:crypto';
import { App } from '@slack/bolt';
import type { IngressAdapter, IngressEvent } from '../contracts';
import { fetchThreadContext } from '../shadow/thread.fetcher';
import { getSession } from '../session';

// ---------------------------------------------------------------------------
// Pure helper — exported for unit testing
// ---------------------------------------------------------------------------

/**
 * Remove all Slack user-mention tokens (`<@U…>`) from a string and trim
 * surrounding whitespace.
 */
export function stripSlackMention(text: string): string {
  return text.replace(/<@[A-Z0-9]+>/g, '').trim();
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

interface SlackAdapterOptions {
  token: string;
  appToken: string;
  ownerUserId: string;
  /** Slack channel IDs to passively shadow (owner messages only). */
  shadowChannels?: string[];
}

export class SlackAdapter implements IngressAdapter {
  private readonly options: SlackAdapterOptions;
  private app: App | null = null;

  constructor(options: SlackAdapterOptions) {
    this.options = options;
  }

  async start(onEvent: (event: IngressEvent) => Promise<void>): Promise<void> {
    const { token, appToken } = this.options;

    this.app = new App({
      token,
      appToken,
      socketMode: true,
    });

    const app = this.app;

    // ------------------------------------------------------------------
    // app_mention handler — fires when the bot is @-mentioned in a channel
    // ------------------------------------------------------------------
    app.event('app_mention', async ({ event }) => {
      const raw = event as {
        text: string;
        user?: string;
        channel: string;
        ts: string;
        thread_ts?: string;
      };

      const threadId = raw.thread_ts;
      const conversationId = `${raw.channel}:${threadId ?? raw.ts}`;

      // Fix 1: fetch thread context so "check this" has something to check
      let threadMessages: string[] | undefined;
      if (threadId) {
        try {
          // includeBots: true — alerts from Coralogix/PagerDuty bots must be visible
          const msgs = await fetchThreadContext(app.client as never, raw.channel, threadId, { includeBots: true });
          if (msgs.length > 0) threadMessages = msgs;
        } catch {
          // non-fatal — emit event without thread context
        }
      }

      const ingressEvent: IngressEvent = {
        id: randomUUID(),
        source: 'slack',
        actorId: raw.user ?? 'unknown',
        channelId: raw.channel,
        conversationId,
        threadId,
        text: stripSlackMention(raw.text),
        ts: raw.ts,
        metadata: threadMessages ? { threadMessages } : undefined,
      };

      try {
        await onEvent(ingressEvent);
      } catch (err) {
        console.error('[SlackAdapter] onEvent error (app_mention):', err);
      }
    });

    // ------------------------------------------------------------------
    // message handler — fires on DMs and channel messages.
    // - DMs (channel_type === 'im') → source: 'slack'
    // - Owner channel messages in shadowChannels → source: 'slack_shadow'
    // ------------------------------------------------------------------
    app.message(async ({ message }) => {
      const raw = message as {
        text?: string;
        user?: string;
        bot_id?: string;
        channel: string;
        channel_type?: string;
        ts: string;
        thread_ts?: string;
      };

      const shadowChannels = this.options.shadowChannels ?? [];

      // Shadow channel branch: non-IM, owner actor, known shadow channel, not a bot message
      if (
        raw.channel_type !== 'im' &&
        raw.user === this.options.ownerUserId &&
        shadowChannels.includes(raw.channel) &&
        !raw.bot_id
      ) {
        const threadId = raw.thread_ts;
        const conversationId = `${raw.channel}:${threadId ?? raw.ts}`;
        const shadowEvent: IngressEvent = {
          id: randomUUID(),
          source: 'slack_shadow',
          actorId: raw.user,
          channelId: raw.channel,
          conversationId,
          threadId,
          text: raw.text ?? '',
          ts: raw.ts,
          metadata: raw.thread_ts ? { threadTs: raw.thread_ts } : undefined,
        };
        try {
          await onEvent(shadowEvent);
        } catch (err) {
          console.error('[SlackAdapter] onEvent error (shadow):', err);
        }
        return;
      }

      // Fix 2: thread continuation — if this is a channel thread reply and Robin
      // has already been in this thread (agentSessionId exists), pass it through
      // so the owner doesn't need to @mention Robin on every reply.
      if (raw.channel_type !== 'im' && raw.thread_ts && !raw.bot_id) {
        const threadConversationId = `${raw.channel}:${raw.thread_ts}`;
        const idx = threadConversationId.indexOf(':');
        const chId = threadConversationId.slice(0, idx);
        const thId = threadConversationId.slice(idx + 1);
        const session = getSession(chId, thId);
        if (session.agentSessionId) {
          const threadEvent: IngressEvent = {
            id: randomUUID(),
            source: 'slack',
            actorId: raw.user ?? 'unknown',
            channelId: raw.channel,
            conversationId: threadConversationId,
            threadId: raw.thread_ts,
            text: raw.text ?? '',
            ts: raw.ts,
          };
          try {
            await onEvent(threadEvent);
          } catch (err) {
            console.error('[SlackAdapter] onEvent error (thread-continuation):', err);
          }
          return;
        }
      }

      // Ignore anything that is not a direct message
      if (raw.channel_type !== 'im') return;

      const threadId = raw.thread_ts;
      const conversationId = `${raw.channel}:${threadId ?? raw.ts}`;

      const ingressEvent: IngressEvent = {
        id: randomUUID(),
        source: 'slack',
        actorId: raw.user ?? 'unknown',
        channelId: raw.channel,
        conversationId,
        threadId,
        text: raw.text ?? '',
        ts: raw.ts,
      };

      try {
        await onEvent(ingressEvent);
      } catch (err) {
        console.error('[SlackAdapter] onEvent error (message/im):', err);
      }
    });

    await app.start();
  }

  async stop(): Promise<void> {
    await this.app?.stop();
  }

  async reply(text: string, threadId: string | undefined, channelId: string): Promise<void> {
    if (!this.app) throw new Error('SlackAdapter: not started');
    await this.app.client.chat.postMessage({ channel: channelId, text, thread_ts: threadId });
  }

  async postMessage(channel: string, text: string): Promise<void> {
    if (!this.app) throw new Error('SlackAdapter: not started');
    await this.app.client.chat.postMessage({ channel, text });
  }
}
