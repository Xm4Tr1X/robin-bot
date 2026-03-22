interface SlackClient {
  conversations: {
    replies(params: { channel: string; ts: string }): Promise<{
      messages?: Array<{ text?: string; bot_id?: string }>;
    }>;
  };
}

/**
 * Fetches the text of human messages from a Slack thread.
 * Returns an empty array on API error or empty thread.
 */
export interface FetchThreadOptions {
  /**
   * When true, bot messages are included. Default: false (shadow path).
   * Set to true for active mentions — alerts come from bots and must not be filtered.
   */
  includeBots?: boolean;
}

export async function fetchThreadContext(
  client: SlackClient,
  channelId: string,
  threadTs: string,
  options: FetchThreadOptions = {},
): Promise<string[]> {
  const { includeBots = false } = options;
  try {
    const response = await client.conversations.replies({ channel: channelId, ts: threadTs });
    const messages = response.messages ?? [];
    return messages
      .filter((m) => (includeBots || !m.bot_id) && typeof m.text === 'string' && m.text.length > 0)
      .map((m) => m.text as string);
  } catch {
    return [];
  }
}
