import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock session and todo modules so tests don't touch the filesystem or
// real in-memory singleton state that bleeds between tests.
// ---------------------------------------------------------------------------

vi.mock('../../../src/session.js', () => ({
  getSession: vi.fn(() => ({
    threadId: 'T1',
    channelId: 'C1',
    mode: 'observe',
    assistantMode: 'orchestrated',
    memory: { constraints: [], decisions: [], pendingActions: [] },
  })),
  getSessionSummary: vi.fn(() => '*Mode:* observe\n_Nothing tracked yet._'),
  resetSession: vi.fn(),
  setMode: vi.fn(),
  saveSnapshot: vi.fn(),
  clearSnapshot: vi.fn(),
  setAssistantMode: vi.fn(),
  getAssistantMode: vi.fn(() => 'orchestrated'),
}));

vi.mock('../../../src/todo.js', () => {
  const mockLedger = {
    add: vi.fn((params) => ({
      id: 'abc12345',
      task: params.task,
      bucket: params.bucket,
      priority: params.priority,
      owner: 'OWNER',
      status: 'todo',
      source: params.source,
      createdAt: new Date().toISOString(),
    })),
    update: vi.fn(() => true),
    formatForSlack: vi.fn(() => '_No active todos._'),
    clear: vi.fn(),
  };
  return { ledgerHolder: { instance: mockLedger } };
});

import { routeCommand, stripMention } from '../../../src/core/command.router.js';
import { ledgerHolder } from '../../../src/todo.js';
import * as session from '../../../src/session.js';

// ---------------------------------------------------------------------------
// Helper — reset mock call counts between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Re-set the add mock to return a fresh item each call
  vi.mocked(ledgerHolder.instance.add).mockImplementation((params) => ({
    id: 'abc12345',
    task: params.task,
    bucket: params.bucket,
    priority: params.priority,
    owner: 'OWNER',
    status: 'todo',
    source: params.source,
    createdAt: new Date().toISOString(),
  }));
  vi.mocked(ledgerHolder.instance.update).mockReturnValue(true);
  vi.mocked(ledgerHolder.instance.formatForSlack).mockReturnValue('*Short-term:*\n• [`abc12345`] *Fix the bug* — high | _todo_');
});

const CONV_ID = 'C1:T1';

// ---------------------------------------------------------------------------
// stripMention
// ---------------------------------------------------------------------------

describe('stripMention', () => {
  it('removes a single <@USERID> mention', () => {
    expect(stripMention('<@U123> hello world')).toBe('hello world');
  });

  it('removes multiple mentions', () => {
    expect(stripMention('<@U123> <@UABC> do this')).toBe('do this');
  });

  it('returns original text when there are no mentions', () => {
    expect(stripMention('just plain text')).toBe('just plain text');
  });

  it('handles mention-only string (returns empty string trimmed)', () => {
    expect(stripMention('<@U123>')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Todo commands
// ---------------------------------------------------------------------------

describe('routeCommand — todo: show todos', () => {
  it('handles "show todos" → commandType=todo, handled=true', () => {
    const result = routeCommand('show todos', CONV_ID);
    expect(result.handled).toBe(true);
    expect(result.commandType).toBe('todo');
    expect(ledgerHolder.instance.formatForSlack).toHaveBeenCalledOnce();
  });

  it('handles "list todos" → handled', () => {
    const result = routeCommand('list todos', CONV_ID);
    expect(result.handled).toBe(true);
    expect(result.commandType).toBe('todo');
  });

  it('handles "my todos" → handled', () => {
    const result = routeCommand('my todos', CONV_ID);
    expect(result.handled).toBe(true);
  });

  it('handles "show todo" (singular) → handled', () => {
    const result = routeCommand('show todo', CONV_ID);
    expect(result.handled).toBe(true);
  });
});

describe('routeCommand — todo: add todo', () => {
  it('adds a todo with high priority and short-term bucket', () => {
    const result = routeCommand('add todo: Fix the bug [high] [short-term]', CONV_ID);
    expect(result.handled).toBe(true);
    expect(result.commandType).toBe('todo');
    expect(ledgerHolder.instance.add).toHaveBeenCalledWith(
      expect.objectContaining({ task: 'Fix the bug', priority: 'high', bucket: 'short-term', source: 'cli' })
    );
    expect(result.reply).toContain('Fix the bug');
    expect(result.reply).toContain('abc12345');
  });

  it('handles "add task:" prefix with low priority and long-term bucket', () => {
    vi.mocked(ledgerHolder.instance.add).mockReturnValueOnce({
      id: 'xyz99999',
      task: 'Deploy service',
      bucket: 'long-term',
      priority: 'low',
      owner: 'OWNER',
      status: 'todo',
    });
    const result = routeCommand('add task: Deploy service [low] [long-term]', CONV_ID);
    expect(result.handled).toBe(true);
    expect(ledgerHolder.instance.add).toHaveBeenCalledWith(
      expect.objectContaining({ task: 'Deploy service', priority: 'low', bucket: 'long-term' })
    );
    expect(result.reply).toContain('Deploy service');
  });

  it('defaults priority to medium when not specified', () => {
    routeCommand('add todo: Write tests', CONV_ID);
    expect(ledgerHolder.instance.add).toHaveBeenCalledWith(
      expect.objectContaining({ priority: 'medium' })
    );
  });

  it('defaults bucket to short-term when not specified', () => {
    routeCommand('add todo: Write tests', CONV_ID);
    expect(ledgerHolder.instance.add).toHaveBeenCalledWith(
      expect.objectContaining({ bucket: 'short-term' })
    );
  });

  it('strips bracket tags from the task name', () => {
    routeCommand('add todo: Fix the bug [high] [short-term]', CONV_ID);
    const callArgs = vi.mocked(ledgerHolder.instance.add).mock.calls[0][0];
    expect(callArgs.task).not.toContain('[high]');
    expect(callArgs.task).not.toContain('[short-term]');
  });
});

describe('routeCommand — todo: mark done', () => {
  it('handles "mark done: abc123" → handled', () => {
    const result = routeCommand('mark done: abc123', CONV_ID);
    expect(result.handled).toBe(true);
    expect(result.commandType).toBe('todo');
    expect(ledgerHolder.instance.update).toHaveBeenCalledWith('abc123', { status: 'done' });
  });

  it('still returns handled even when ID is not found', () => {
    vi.mocked(ledgerHolder.instance.update).mockReturnValueOnce(false);
    const result = routeCommand('mark done: nonexistent-id', CONV_ID);
    expect(result.handled).toBe(true);
  });

  it('handles "mark blocked: xyz" → handled', () => {
    const result = routeCommand('mark blocked: xyz', CONV_ID);
    expect(result.handled).toBe(true);
    expect(ledgerHolder.instance.update).toHaveBeenCalledWith('xyz', { status: 'blocked' });
  });

  it('handles "mark in-progress: xyz" → handled', () => {
    const result = routeCommand('mark in-progress: xyz', CONV_ID);
    expect(result.handled).toBe(true);
    expect(ledgerHolder.instance.update).toHaveBeenCalledWith('xyz', { status: 'in-progress' });
  });

  it('handles "mark inprogress: xyz" (no hyphen variant)', () => {
    const result = routeCommand('mark inprogress: xyz', CONV_ID);
    expect(result.handled).toBe(true);
    expect(ledgerHolder.instance.update).toHaveBeenCalledWith('xyz', { status: 'in-progress' });
  });
});

// ---------------------------------------------------------------------------
// Mode commands
// ---------------------------------------------------------------------------

describe('routeCommand — mode', () => {
  it('handles "reply mode" → commandType=mode, reply contains "reply mode"', () => {
    const result = routeCommand('reply mode', CONV_ID);
    expect(result.handled).toBe(true);
    expect(result.commandType).toBe('mode');
    expect(result.reply).toContain('reply mode');
    expect(session.setMode).toHaveBeenCalledWith('C1', 'T1', 'reply');
  });

  it('handles "draft mode" → handled', () => {
    const result = routeCommand('draft mode', CONV_ID);
    expect(result.handled).toBe(true);
    expect(result.commandType).toBe('mode');
    expect(result.reply).toContain('draft mode');
    expect(session.setMode).toHaveBeenCalledWith('C1', 'T1', 'draft');
  });

  it('handles "observe mode" → handled', () => {
    const result = routeCommand('observe mode', CONV_ID);
    expect(result.handled).toBe(true);
    expect(result.commandType).toBe('mode');
    expect(result.reply).toContain('observe mode');
    expect(session.setMode).toHaveBeenCalledWith('C1', 'T1', 'observe');
  });

  it('handles "switch to reply mode" (word boundary)', () => {
    const result = routeCommand('switch to reply mode', CONV_ID);
    expect(result.handled).toBe(true);
    expect(session.setMode).toHaveBeenCalledWith('C1', 'T1', 'reply');
  });
});

// ---------------------------------------------------------------------------
// Session commands
// ---------------------------------------------------------------------------

describe('routeCommand — session', () => {
  it('handles "reset session" → commandType=session', () => {
    const result = routeCommand('reset session', CONV_ID);
    expect(result.handled).toBe(true);
    expect(result.commandType).toBe('session');
    expect(session.resetSession).toHaveBeenCalledWith('C1', 'T1');
    expect(result.reply).toContain('reset');
  });

  it('handles "summarize context" → commandType=session', () => {
    const result = routeCommand('summarize context', CONV_ID);
    expect(result.handled).toBe(true);
    expect(result.commandType).toBe('session');
    expect(session.getSessionSummary).toHaveBeenCalledWith('C1', 'T1');
  });

  it('handles "what are you tracking" → commandType=session', () => {
    const result = routeCommand('what are you tracking', CONV_ID);
    expect(result.handled).toBe(true);
    expect(result.commandType).toBe('session');
  });
});

// ---------------------------------------------------------------------------
// Snapshot commands
// ---------------------------------------------------------------------------

describe('routeCommand — snapshot', () => {
  it('handles "save snapshot" → commandType=snapshot', () => {
    const result = routeCommand('save snapshot', CONV_ID);
    expect(result.handled).toBe(true);
    expect(result.commandType).toBe('snapshot');
    expect(session.saveSnapshot).toHaveBeenCalledOnce();
    expect(result.reply).toContain('Snapshot saved');
  });

  it('handles "discard snapshot" → handled, clears snapshot and ledger', () => {
    const result = routeCommand('discard snapshot', CONV_ID);
    expect(result.handled).toBe(true);
    expect(result.commandType).toBe('snapshot');
    expect(session.clearSnapshot).toHaveBeenCalledOnce();
    expect(ledgerHolder.instance.clear).toHaveBeenCalledOnce();
    expect(result.reply).toContain('discarded');
  });
});

// ---------------------------------------------------------------------------
// Unhandled
// ---------------------------------------------------------------------------

describe('routeCommand — unhandled', () => {
  it('returns handled=false for unrecognised input', () => {
    const result = routeCommand('hello world', CONV_ID);
    expect(result.handled).toBe(false);
    expect(result.reply).toBeUndefined();
    expect(result.commandType).toBeUndefined();
  });

  it('returns handled=false for empty string', () => {
    const result = routeCommand('', CONV_ID);
    expect(result.handled).toBe(false);
  });

  it('returns handled=false for generic question', () => {
    const result = routeCommand('what is the weather today?', CONV_ID);
    expect(result.handled).toBe(false);
  });
});
