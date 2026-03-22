/**
 * TDD — todo.executor: extract and auto-execute todo commands from LLM response text.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { extractTodoCommands, executeTodoCommands } from '../../../../src/features/todos/todo.executor.js';
import { MemoryStore } from '../../../../src/store/memory.store.js';
import { initTodoLedger, ledgerHolder } from '../../../../src/todo.js';

describe('extractTodoCommands', () => {
  it('extracts add todo commands from a code block', () => {
    const text = 'Here are the commands:\n```\nadd todo: taza tindi\nadd todo: ai architecture upskill\n```';
    expect(extractTodoCommands(text)).toEqual([
      'add todo: taza tindi',
      'add todo: ai architecture upskill',
    ]);
  });

  it('extracts commands from inline backtick lines', () => {
    const text = 'Run `add todo: taza tindi` and `mark done: abc12345`';
    const cmds = extractTodoCommands(text);
    expect(cmds).toContain('add todo: taza tindi');
    expect(cmds).toContain('mark done: abc12345');
  });

  it('extracts commands from plain lines starting with the command', () => {
    const text = 'add todo: taza tindi\nmark done: abc12345\nmark in-progress: def67890';
    const cmds = extractTodoCommands(text);
    expect(cmds).toContain('add todo: taza tindi');
    expect(cmds).toContain('mark done: abc12345');
    expect(cmds).toContain('mark in-progress: def67890');
  });

  it('returns empty array when no commands present', () => {
    expect(extractTodoCommands('hello world, nothing to do here')).toEqual([]);
  });

  it('deduplicates identical commands', () => {
    const text = '`add todo: taza tindi`\nadd todo: taza tindi';
    const cmds = extractTodoCommands(text);
    const addCmds = cmds.filter(c => c === 'add todo: taza tindi');
    expect(addCmds).toHaveLength(1);
  });

  it('handles mark blocked and mark in-progress', () => {
    const text = '```\nmark blocked: abc12345\nmark in-progress: def67890\n```';
    const cmds = extractTodoCommands(text);
    expect(cmds).toContain('mark blocked: abc12345');
    expect(cmds).toContain('mark in-progress: def67890');
  });
});

describe('executeTodoCommands', () => {
  beforeEach(() => {
    const store = new MemoryStore();
    initTodoLedger(store);
  });

  it('adds todos to the ledger and returns a summary', () => {
    const result = executeTodoCommands([
      'add todo: taza tindi',
      'add todo: ai architecture upskill',
    ]);
    expect(result.executed).toHaveLength(2);
    expect(result.executed[0]).toContain('taza tindi');
    expect(result.executed[1]).toContain('ai architecture upskill');

    const todos = ledgerHolder.instance.serialize();
    expect(todos.some(t => t.task === 'taza tindi')).toBe(true);
    expect(todos.some(t => t.task === 'ai architecture upskill')).toBe(true);
  });

  it('marks a todo as done', () => {
    const added = ledgerHolder.instance.add({
      task: 'test task',
      bucket: 'short-term',
      priority: 'medium',
    });
    const result = executeTodoCommands([`mark done: ${added.id}`]);
    expect(result.executed[0]).toContain('done');
    const updated = ledgerHolder.instance.serialize().find(t => t.id === added.id);
    expect(updated?.status).toBe('done');
  });

  it('returns empty executed array when no commands given', () => {
    const result = executeTodoCommands([]);
    expect(result.executed).toHaveLength(0);
  });

  it('skips unknown commands gracefully', () => {
    const result = executeTodoCommands(['mark done: nonexistent-id']);
    // Should not throw; just produces an empty or error entry
    expect(result.executed).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
  });
});
