import { query } from '@anthropic-ai/claude-agent-sdk';
import { SYSTEM_PROMPT, ALLOWED_TOOLS, MAX_TURNS } from './config';

// Allow the bot to spawn a Claude Code subprocess even when launched from within
// a Claude Code session (e.g. during development). In production this is a no-op.
delete process.env.CLAUDECODE;

export interface ChatResult {
  response: string;
  sessionId: string;
}

/**
 * Send a message to Claude Code via the Agent SDK.
 *
 * New sessions: pass prompt only — system prompt + tools are set on first call.
 * Existing sessions: pass sessionId to resume — Claude Code preserves full conversation history.
 */
export async function chat(params: {
  prompt: string;
  sessionId?: string;
}): Promise<ChatResult> {
  const { prompt, sessionId } = params;

  let capturedSessionId = sessionId ?? '';
  let response = '';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const options: Record<string, any> = {
    maxTurns: MAX_TURNS,
    permissionMode: 'bypassPermissions', // required for unattended bot operation
  };

  if (sessionId) {
    // Resume existing session — history + tools already set
    options.resume = sessionId;
  } else {
    // First message in this thread — configure the session
    options.systemPrompt = SYSTEM_PROMPT;
    options.allowedTools = ALLOWED_TOOLS;
  }

  for await (const message of query({ prompt, options })) {
    // Capture session ID on init (emitted once at the start of each session)
    if ('subtype' in message && message.subtype === 'init') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      capturedSessionId = (message as any).session_id ?? capturedSessionId;
    }
    if ('result' in message && typeof message.result === 'string') {
      response = message.result;
    }
  }

  return { response, sessionId: capturedSessionId };
}
