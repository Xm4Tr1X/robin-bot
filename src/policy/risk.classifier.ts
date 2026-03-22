export type RiskLevel = 'low' | 'medium' | 'high';

const FORBIDDEN_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit', 'Bash']);

const HIGH_PATTERNS = /\b(write|edit|execute|run|delete|remove|deploy|bash|script|overwrite|drop|truncate|migrate)\b/i;
const MEDIUM_PATTERNS = /\b(send|post|reply|publish|announce|notify|message|dm)\b/i;
const LOW_PATTERNS = /\b(search|find|show|list|read|get|fetch|grep|glob|summarize|draft|check|view|display|what|which|how)\b/i;

/**
 * Classifies the risk level of a task based on text keywords and tool trace.
 *
 * - high: write/execute/delete/deploy operations, or forbidden tools in toolTrace
 * - medium: send/post/reply operations
 * - low: read/search/list/draft/summarize operations
 * - default for ambiguous text: medium
 * - default for empty text: low
 */
export function classifyRisk(text: string, toolTrace: string[] = []): RiskLevel {
  // Tool trace escalation takes highest precedence
  if (toolTrace.some((t) => FORBIDDEN_TOOLS.has(t))) return 'high';

  if (!text.trim()) return 'low';

  if (HIGH_PATTERNS.test(text)) return 'high';
  if (LOW_PATTERNS.test(text)) return 'low';
  if (MEDIUM_PATTERNS.test(text)) return 'medium';

  // Ambiguous text defaults to medium
  return 'medium';
}
