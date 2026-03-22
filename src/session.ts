import fs from 'fs';
import path from 'path';
import { Session, Mode, AssistantMode, Snapshot } from './types';
import { ledgerHolder } from './todo';
import { SNAPSHOT_DIR } from './config';

const sessions = new Map<string, Session>();
const SNAPSHOT_FILE = path.join(SNAPSHOT_DIR, 'robin-snapshot.json');

function sessionKey(channelId: string, threadId: string): string {
  return `${channelId}:${threadId}`;
}

export function getSession(channelId: string, threadId: string): Session {
  const key = sessionKey(channelId, threadId);
  if (!sessions.has(key)) {
    sessions.set(key, {
      threadId,
      channelId,
      mode: 'reply',
      assistantMode: 'orchestrated',
      memory: { constraints: [], decisions: [], pendingActions: [] },
    });
  }
  return sessions.get(key)!;
}

export function setMode(channelId: string, threadId: string, mode: Mode): void {
  getSession(channelId, threadId).mode = mode;
}

export function setAssistantMode(channelId: string, threadId: string, mode: AssistantMode): void {
  getSession(channelId, threadId).assistantMode = mode;
}

export function getAssistantMode(channelId: string, threadId: string): AssistantMode {
  return getSession(channelId, threadId).assistantMode;
}

/** Store the Claude Code session ID so subsequent messages can resume the conversation. */
export function setAgentSessionId(
  channelId: string,
  threadId: string,
  agentSessionId: string
): void {
  getSession(channelId, threadId).agentSessionId = agentSessionId;
}

export function resetSession(channelId: string, threadId: string): void {
  // Clearing agentSessionId starts a fresh Claude Code session on next message
  sessions.set(sessionKey(channelId, threadId), {
    threadId,
    channelId,
    mode: 'reply',
    assistantMode: 'orchestrated',
    memory: { constraints: [], decisions: [], pendingActions: [] },
  });
}

export function getSessionSummary(channelId: string, threadId: string): string {
  const s = getSession(channelId, threadId);
  const m = s.memory;
  const lines = [`*Mode:* ${s.mode} | *Assistant:* ${s.assistantMode}`];
  if (m.objective) lines.push(`*Objective:* ${m.objective}`);
  if (m.constraints.length > 0)
    lines.push(`*Constraints:*\n${m.constraints.map((c) => `• ${c}`).join('\n')}`);
  if (m.decisions.length > 0)
    lines.push(`*Decisions:*\n${m.decisions.map((d) => `• ${d}`).join('\n')}`);
  if (m.pendingActions.length > 0)
    lines.push(`*Pending:*\n${m.pendingActions.map((a) => `• ${a}`).join('\n')}`);
  if (lines.length === 1) lines.push('_Nothing tracked yet._');
  return lines.join('\n');
}

// --- Snapshot management ---

export function saveSnapshot(summary?: string): void {
  try {
    if (!fs.existsSync(SNAPSHOT_DIR)) {
      fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
    }
    const snapshot: Snapshot = {
      todos: ledgerHolder.instance.serialize(),
      sessionSummary: summary,
      timestamp: new Date().toISOString(),
    };
    fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2));
  } catch (err) {
    console.error('Failed to save snapshot:', err);
  }
}

export function loadSnapshot(): Snapshot | null {
  try {
    if (!fs.existsSync(SNAPSHOT_FILE)) return null;
    const snapshot: Snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf-8'));
    if (snapshot.todos?.length) ledgerHolder.instance.load(snapshot.todos);
    return snapshot;
  } catch {
    return null;
  }
}

export function clearSnapshot(): void {
  try {
    if (fs.existsSync(SNAPSHOT_FILE)) fs.unlinkSync(SNAPSHOT_FILE);
  } catch (err) {
    console.error('Failed to clear snapshot:', err);
  }
}
