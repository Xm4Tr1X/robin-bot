/**
 * todo.executor — extracts Robin todo commands from LLM response text
 * and executes them directly against the ledger.
 *
 * This closes the gap where the LLM says "run these commands" instead of
 * acting. On CLI (trusted source), Robin auto-executes any todo commands
 * the LLM suggests in its response.
 */

import { ledgerHolder } from '../../todo';

// Commands the executor can handle
const TODO_CMD_PATTERNS = [
  /\badd (?:todo|task):?\s+(.+)/i,
  /\bmark done:?\s+(\S+)/i,
  /\bmark in.?progress:?\s+(\S+)/i,
  /\bmark blocked:?\s+(\S+)/i,
];

export interface ExecuteResult {
  executed: string[];
  skipped: string[];
}

/**
 * Extracts todo command strings from LLM response text.
 * Looks inside code blocks, inline backticks, and plain lines.
 */
export function extractTodoCommands(text: string): string[] {
  const found = new Set<string>();

  // Strip triple-backtick code blocks and process their lines first
  const stripped = text.replace(/```[\s\S]*?```/g, (block) => {
    for (const line of block.split('\n')) {
      const trimmed = line.trim();
      if (isTodoCommand(trimmed)) found.add(trimmed);
    }
    return '';
  });

  // From inline single-backticks (now code blocks are removed): `add todo: X`
  for (const m of stripped.matchAll(/`([^`\n]+)`/g)) {
    const inner = m[1].trim();
    if (isTodoCommand(inner)) found.add(inner);
  }

  // From plain lines in the remaining text
  for (const line of stripped.split('\n')) {
    const trimmed = line.trim();
    if (isTodoCommand(trimmed)) found.add(trimmed);
  }

  return Array.from(found);
}

function isTodoCommand(line: string): boolean {
  return TODO_CMD_PATTERNS.some(p => p.test(line));
}

/**
 * Executes a list of todo command strings against the ledger.
 * Returns what was executed and what was skipped (unknown id, etc.).
 */
export function executeTodoCommands(commands: string[]): ExecuteResult {
  const executed: string[] = [];
  const skipped: string[] = [];

  for (const cmd of commands) {
    const addMatch = /^add (?:todo|task):?\s+(.+)/i.exec(cmd);
    if (addMatch) {
      const task = addMatch[1].trim();
      const item = ledgerHolder.instance.add({
        task,
        bucket: 'short-term',
        priority: 'medium',
        source: 'cli',
      });
      executed.push(`added: ${item.task} [\`${item.id}\`]`);
      continue;
    }

    const doneMatch = /^mark done:?\s+(\S+)/i.exec(cmd);
    if (doneMatch) {
      const id = doneMatch[1];
      const ok = ledgerHolder.instance.update(id, { status: 'done' });
      if (ok) {
        const item = ledgerHolder.instance.serialize().find(t => t.id.startsWith(id));
        executed.push(`marked done: ${item?.task ?? id} [\`${id}\`]`);
      } else {
        skipped.push(cmd);
      }
      continue;
    }

    const progressMatch = /^mark in.?progress:?\s+(\S+)/i.exec(cmd);
    if (progressMatch) {
      const id = progressMatch[1];
      const ok = ledgerHolder.instance.update(id, { status: 'in-progress' });
      if (ok) {
        const item = ledgerHolder.instance.serialize().find(t => t.id.startsWith(id));
        executed.push(`marked in-progress: ${item?.task ?? id} [\`${id}\`]`);
      } else {
        skipped.push(cmd);
      }
      continue;
    }

    const blockedMatch = /^mark blocked:?\s+(\S+)/i.exec(cmd);
    if (blockedMatch) {
      const id = blockedMatch[1];
      const ok = ledgerHolder.instance.update(id, { status: 'blocked' });
      if (ok) {
        const item = ledgerHolder.instance.serialize().find(t => t.id.startsWith(id));
        executed.push(`marked blocked: ${item?.task ?? id} [\`${id}\`]`);
      } else {
        skipped.push(cmd);
      }
      continue;
    }

    skipped.push(cmd);
  }

  return { executed, skipped };
}
