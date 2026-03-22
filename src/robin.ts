import { chat } from './claude';
import {
  getSession,
  setMode,
  setAgentSessionId,
  resetSession,
  getSessionSummary,
  saveSnapshot,
} from './session';
import { ledgerHolder } from './todo';
import { Mode, Priority, Bucket } from './types';

type SayFn = (params: { text: string; thread_ts?: string }) => Promise<void>;

interface SlackEvent {
  text: string;
  thread_ts?: string;
  ts: string;
  channel: string;
  user?: string;
}

function stripMention(text: string): string {
  return text.replace(/<@[A-Z0-9]+>/g, '').trim();
}

function detectMode(text: string): Mode | null {
  if (/\breply mode\b/i.test(text)) return 'reply';
  if (/\bdraft mode\b/i.test(text)) return 'draft';
  if (/\bobserve mode\b/i.test(text)) return 'observe';
  return null;
}

function isYes(text: string): boolean {
  return /^(yes|yeah|yep|sure|ok|okay|go ahead|yes go ahead|reply|respond)$/i.test(
    text.trim()
  );
}

function parseTodoCommand(text: string): {
  task: string;
  priority: Priority;
  bucket: Bucket;
} | null {
  const match = text.match(/^add (?:todo|task):?\s+(.+)/i);
  if (!match) return null;
  const raw = match[1];
  const priorityMatch = raw.match(/\[(high|medium|low)\]/i);
  const bucketMatch = raw.match(/\[(short-term|long-term)\]/i);
  const task = raw
    .replace(/\[(high|medium|low)\]/gi, '')
    .replace(/\[(short-term|long-term)\]/gi, '')
    .trim();
  return {
    task,
    priority: ((priorityMatch?.[1] ?? 'medium').toLowerCase() as Priority),
    bucket: ((bucketMatch?.[1] ?? 'short-term').toLowerCase() as Bucket),
  };
}

export async function handleMention(
  event: SlackEvent,
  say: SayFn
): Promise<void> {
  const threadId = event.thread_ts ?? event.ts;
  const channelId = event.channel;
  const session = getSession(channelId, threadId);
  const userText = stripMention(event.text);

  // --- Session controls ---
  if (/summarize context/i.test(userText)) {
    await say({ text: getSessionSummary(channelId, threadId), thread_ts: threadId });
    return;
  }
  if (/what are you tracking\??/i.test(userText)) {
    await say({ text: getSessionSummary(channelId, threadId), thread_ts: threadId });
    return;
  }
  if (/reset session/i.test(userText)) {
    resetSession(channelId, threadId);
    await say({
      text: '_Session reset. Starting fresh from your latest instruction._',
      thread_ts: threadId,
    });
    return;
  }

  // --- Snapshot controls ---
  if (/^save snapshot/i.test(userText)) {
    saveSnapshot('Manual save');
    await say({ text: '_Snapshot saved._', thread_ts: threadId });
    return;
  }
  if (/^discard snapshot/i.test(userText)) {
    const { clearSnapshot } = await import('./session');
    clearSnapshot();
    ledgerHolder.instance.load([]);
    await say({ text: '_Snapshot discarded. Starting fresh._', thread_ts: threadId });
    return;
  }

  // --- Mode switch ---
  const newMode = detectMode(userText);
  if (newMode) {
    setMode(channelId, threadId, newMode);
    await say({ text: `_Switched to ${newMode} mode._`, thread_ts: threadId });
    return;
  }

  // --- Todo commands ---
  const todoParams = parseTodoCommand(userText);
  if (todoParams) {
    const item = ledgerHolder.instance.add(todoParams);
    await say({
      text:
        `_Added_ [\`${item.id}\`]: *${item.task}* — ${item.priority} priority, ${item.bucket}\n\n` +
        `_What's the ETA for this?_`,
      thread_ts: threadId,
    });
    return;
  }
  if (/^(show todos?|list todos?|my todos?)/i.test(userText)) {
    await say({ text: ledgerHolder.instance.formatForSlack(), thread_ts: threadId });
    return;
  }
  if (/^mark done:?\s+(\S+)/i.test(userText)) {
    const idMatch = userText.match(/^mark done:?\s+(\S+)/i);
    const id = idMatch?.[1] ?? '';
    const ok = ledgerHolder.instance.update(id, { status: 'done' });
    await say({
      text: ok ? `_Marked \`${id}\` as done._` : `_Todo \`${id}\` not found._`,
      thread_ts: threadId,
    });
    return;
  }

  // --- Observe mode: yes confirmation to switch to reply ---
  if (session.mode === 'observe' && isYes(userText)) {
    setMode(channelId, threadId, 'reply');
    await say({ text: '_Switching to reply mode._', thread_ts: threadId });
    return;
  }

  // --- Observe mode: acknowledge and offer to reply ---
  if (session.mode === 'observe') {
    await say({
      text: `_Got it. Should I reply in detail? (say "yes" or "go ahead")_`,
      thread_ts: threadId,
    });
    return;
  }

  // --- Reply / Draft mode: call Claude Code via Agent SDK ---
  const todos = ledgerHolder.instance.formatForSlack();
  const prompt = `[Mode: ${session.mode}]\n[Active todos:]\n${todos}\n\nUser: ${userText}`;

  try {
    // Resume the existing Claude Code session for this thread, or start a new one
    const { response, sessionId } = await chat({
      prompt,
      sessionId: session.agentSessionId,
    });

    // Persist the session ID so the next message resumes full conversation context
    setAgentSessionId(channelId, threadId, sessionId);

    if (session.mode === 'draft') {
      await say({
        text: `*Draft — reply "approve" to post or edit as needed:*\n\`\`\`\n${response}\n\`\`\``,
        thread_ts: threadId,
      });
    } else {
      await say({ text: response, thread_ts: threadId });
    }
  } catch (err) {
    console.error('[robin] Claude Code error:', err);
    await say({
      text: '_Ran into an error. Please try again._',
      thread_ts: threadId,
    });
  }
}

export async function sendCheckin(
  postMessage: (text: string) => Promise<void>,
  type: 'morning' | 'evening'
): Promise<void> {
  const todos = ledgerHolder.instance.formatForSlack();
  const text =
    type === 'morning'
      ? `*Morning check-in* (IST 11:30)\n\n${todos}\n\n_What are you working on today?_`
      : `*End-of-day check-in* (IST 17:30)\n\n${todos}\n\n_Anything to update before wrapping up?_`;
  await postMessage(text);
}
