import { describe, it, expect } from 'vitest';
import type { IngressEvent, MemoryEntry } from '../../../src/contracts.js';
import { classifyTask, buildPromptEnvelope } from '../../../src/prompting/prompt.builder.js';
import type { PromptBuildInput } from '../../../src/prompting/prompt.builder.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<IngressEvent> = {}): IngressEvent {
  return {
    id: 'evt-001',
    source: 'slack',
    actorId: 'U_OWNER',
    channelId: 'C_GENERAL',
    conversationId: 'C_GENERAL:1700000000.000001',
    text: 'hello world',
    ts: '1700000000.000001',
    ...overrides,
  };
}

function makeMemoryEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: 'mem-001',
    conversationId: 'C_GENERAL:1700000000.000001',
    kind: 'objective',
    content: 'Fix the CI pipeline',
    createdAt: '2026-03-07T00:00:00.000Z',
    ...overrides,
  };
}

function makeInput(overrides: Partial<PromptBuildInput> = {}): PromptBuildInput {
  return {
    event: makeEvent(),
    memoryEntries: [],
    sessionMode: 'observe',
    allowedTools: ['Read', 'Bash'],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// classifyTask
// ---------------------------------------------------------------------------

describe('classifyTask', () => {
  it("classifies 'add todo' as 'todo'", () => {
    expect(classifyTask('add todo')).toBe('todo');
  });

  it("classifies 'draft email' as 'comms'", () => {
    expect(classifyTask('draft email')).toBe('comms');
  });

  it("classifies 'deploy service' as 'ops'", () => {
    expect(classifyTask('deploy service')).toBe('ops');
  });

  it("classifies 'hello world' as 'general'", () => {
    expect(classifyTask('hello world')).toBe('general');
  });

  it("classifies 'check incident' as 'alert'", () => {
    expect(classifyTask('check incident')).toBe('alert');
  });

  it('is case-insensitive for todo keyword', () => {
    expect(classifyTask('Mark as DONE')).toBe('todo');
  });

  it('is case-insensitive for alert keyword', () => {
    expect(classifyTask('PagerDuty fired')).toBe('alert');
  });

  it("classifies 'write announcement' as 'comms'", () => {
    expect(classifyTask('write announcement')).toBe('comms');
  });

  it("classifies 'rollout infra' as 'ops'", () => {
    expect(classifyTask('rollout infra')).toBe('ops');
  });

  it("classifies 'task is blocked' as 'todo'", () => {
    expect(classifyTask('task is blocked')).toBe('todo');
  });
});

// ---------------------------------------------------------------------------
// buildPromptEnvelope
// ---------------------------------------------------------------------------

describe('buildPromptEnvelope', () => {
  it('returns the correct taskClass based on event text', () => {
    const envelope = buildPromptEnvelope(makeInput({ event: makeEvent({ text: 'add todo item' }) }));
    expect(envelope.taskClass).toBe('todo');
  });

  it('returns general taskClass for unrecognised text', () => {
    const envelope = buildPromptEnvelope(makeInput({ event: makeEvent({ text: 'hello world' }) }));
    expect(envelope.taskClass).toBe('general');
  });

  it('memoryContext includes all memory entries formatted correctly', () => {
    const entries: MemoryEntry[] = [
      makeMemoryEntry({ kind: 'objective', content: 'Fix the CI pipeline' }),
      makeMemoryEntry({ id: 'mem-002', kind: 'constraint', content: 'No deploys on Friday' }),
    ];
    const envelope = buildPromptEnvelope(makeInput({ memoryEntries: entries }));
    expect(envelope.memoryContext).toHaveLength(2);
    expect(envelope.memoryContext[0]).toBe('[objective] Fix the CI pipeline');
    expect(envelope.memoryContext[1]).toBe('[constraint] No deploys on Friday');
  });

  it('empty memoryEntries produces empty memoryContext array', () => {
    const envelope = buildPromptEnvelope(makeInput({ memoryEntries: [] }));
    expect(envelope.memoryContext).toEqual([]);
  });

  it('channelContext includes the session mode', () => {
    const envelope = buildPromptEnvelope(makeInput({ sessionMode: 'reply' }));
    expect(envelope.channelContext).toContain('[mode: reply]');
  });

  it('channelContext includes the event source', () => {
    const envelope = buildPromptEnvelope(makeInput({ event: makeEvent({ source: 'slack' }) }));
    expect(envelope.channelContext).toContain('[source: slack]');
  });

  it("responseContract format is 'slack_mrkdwn' for source='slack'", () => {
    const envelope = buildPromptEnvelope(makeInput({ event: makeEvent({ source: 'slack' }) }));
    expect(envelope.responseContract.format).toBe('slack_mrkdwn');
  });

  it("responseContract format is 'markdown' for source='cli'", () => {
    const envelope = buildPromptEnvelope(makeInput({ event: makeEvent({ source: 'cli' }) }));
    expect(envelope.responseContract.format).toBe('markdown');
  });

  it("responseContract allowExternalLinks is false for source='slack'", () => {
    const envelope = buildPromptEnvelope(makeInput({ event: makeEvent({ source: 'slack' }) }));
    expect(envelope.responseContract.allowExternalLinks).toBe(false);
  });

  it("responseContract allowExternalLinks is true for source='cli'", () => {
    const envelope = buildPromptEnvelope(makeInput({ event: makeEvent({ source: 'cli' }) }));
    expect(envelope.responseContract.allowExternalLinks).toBe(true);
  });

  it("responseContract maxLength is 4000 for source='slack'", () => {
    const envelope = buildPromptEnvelope(makeInput({ event: makeEvent({ source: 'slack' }) }));
    expect(envelope.responseContract.maxLength).toBe(4000);
  });

  it("responseContract maxLength is undefined for source='cli'", () => {
    const envelope = buildPromptEnvelope(makeInput({ event: makeEvent({ source: 'cli' }) }));
    expect(envelope.responseContract.maxLength).toBeUndefined();
  });

  it('policyConstraints are passed through unchanged', () => {
    const constraints = ['no secrets', 'no external links'];
    const envelope = buildPromptEnvelope(makeInput({ policyConstraints: constraints }));
    expect(envelope.policyConstraints).toEqual(constraints);
  });

  it('policyConstraints defaults to empty array when not provided', () => {
    const envelope = buildPromptEnvelope(makeInput({ policyConstraints: undefined }));
    expect(envelope.policyConstraints).toEqual([]);
  });

  it('allowedTools are passed through', () => {
    const tools = ['Read', 'Glob', 'WebSearch'];
    const envelope = buildPromptEnvelope(makeInput({ allowedTools: tools }));
    expect(envelope.allowedTools).toEqual(tools);
  });

  it('userInput matches event.text', () => {
    const envelope = buildPromptEnvelope(makeInput({ event: makeEvent({ text: 'deploy the service now' }) }));
    expect(envelope.userInput).toBe('deploy the service now');
  });

  it('persona is a non-empty string', () => {
    const envelope = buildPromptEnvelope(makeInput());
    expect(typeof envelope.persona).toBe('string');
    expect(envelope.persona.length).toBeGreaterThan(0);
  });

  // Bug B regression tests — todoContext must appear in channelContext
  it('todoContext appears in channelContext when provided', () => {
    const todos = '• [`abc12345`] *taza tindi* — medium | _todo_';
    const envelope = buildPromptEnvelope(makeInput({ todoContext: todos }));
    expect(envelope.channelContext.some(c => c.includes('[current todos]'))).toBe(true);
    expect(envelope.channelContext.some(c => c.includes('taza tindi'))).toBe(true);
  });

  it('todoContext is omitted from channelContext when undefined', () => {
    const envelope = buildPromptEnvelope(makeInput({ todoContext: undefined }));
    expect(envelope.channelContext.every(c => !c.includes('[current todos]'))).toBe(true);
  });
});
