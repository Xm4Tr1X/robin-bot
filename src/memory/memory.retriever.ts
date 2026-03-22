import type { MemoryEntry } from '../contracts';

/**
 * Maps each memory entry to a formatted string: "[kind] content"
 */
export function formatMemoryContext(entries: MemoryEntry[]): string[] {
  return entries.map((e) => `[${e.kind}] ${e.content}`);
}

/**
 * Groups entries by kind and returns a human-readable summary.
 */
export function summarizeMemory(entries: MemoryEntry[]): string {
  if (entries.length === 0) return 'No memory entries.';

  const groups = new Map<MemoryEntry['kind'], MemoryEntry[]>();

  for (const entry of entries) {
    const existing = groups.get(entry.kind);
    if (existing) {
      existing.push(entry);
    } else {
      groups.set(entry.kind, [entry]);
    }
  }

  const lines: string[] = [];
  for (const [kind, kindEntries] of groups.entries()) {
    lines.push(`${kind} (${kindEntries.length}):`);
    for (const e of kindEntries) {
      lines.push(`  - ${e.content}`);
    }
  }

  return lines.join('\n');
}
