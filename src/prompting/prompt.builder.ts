import type { IngressEvent, MemoryEntry, PromptEnvelope, TaskClass } from '../contracts';
import { getPersona, buildResponseContract } from './persona.registry';

// ---------------------------------------------------------------------------
// Public input type
// ---------------------------------------------------------------------------

export interface PromptBuildInput {
  event: IngressEvent;
  memoryEntries: MemoryEntry[];
  /** 'observe' | 'reply' | 'draft' */
  sessionMode: string;
  allowedTools: string[];
  policyConstraints?: string[];
  personaId?: string;
  /** Global owner-level memory (preferences + behavioral patterns). Prepended before conv-local memory. */
  globalEntries?: MemoryEntry[];
  /** Live todo list — injected when task class is todo so LLM knows IDs. */
  todoContext?: string;
  /** Thread messages from Slack — injected when the mention is a thread reply. */
  threadContext?: string[];
}

// ---------------------------------------------------------------------------
// Task classifier
// ---------------------------------------------------------------------------

/**
 * Classifies the intent of free-form text into a TaskClass.
 *
 * Rules (evaluated in order; first match wins):
 *   todo    → /\btodo|task|done|progress|blocked\b/i
 *   alert   → /\balert|incident|outage|pagerduty\b/i
 *   comms   → /\bwrite|draft|email|message|announce\b/i
 *   ops     → /\bdeploy|rollout|migrate|infra|ops\b/i
 *   default → 'general'
 */
export function classifyTask(text: string): TaskClass {
  if (/\btodo|task|done|progress|blocked\b/i.test(text)) return 'todo';
  if (/\balert|incident|outage|pagerduty\b/i.test(text)) return 'alert';
  if (/\bwrite|draft|email|message|announce\b/i.test(text)) return 'comms';
  if (/\bdeploy|rollout|migrate|infra|ops\b/i.test(text)) return 'ops';
  return 'general';
}

// ---------------------------------------------------------------------------
// Envelope builder
// ---------------------------------------------------------------------------

/**
 * Builds a PromptEnvelope from the available context.
 * Pure function — no I/O, no side effects.
 */
export function buildPromptEnvelope(input: PromptBuildInput): PromptEnvelope {
  const { event, memoryEntries, sessionMode, allowedTools, policyConstraints, personaId, globalEntries, todoContext, threadContext } = input;

  const globalContext: string[] = (globalEntries ?? []).map(
    (e) => `[owner context] [${e.kind}] ${e.content}`,
  );
  const localContext = memoryEntries.map((entry) => `[${entry.kind}] ${entry.content}`);

  const channelContext: string[] = [`[mode: ${sessionMode}]`, `[source: ${event.source}]`];
  if (todoContext) {
    channelContext.push(`[current todos]\n${todoContext}`);
  }
  if (threadContext && threadContext.length > 0) {
    const formatted = threadContext.map((m, i) => `[${i + 1}] ${m}`).join('\n');
    channelContext.push(`[thread context — messages above in this Slack thread]\n${formatted}`);
  }

  return {
    taskClass: classifyTask(event.text),
    persona: getPersona(personaId).systemPrompt,
    policyConstraints: policyConstraints ?? [],
    memoryContext: [...globalContext, ...localContext],
    channelContext,
    allowedTools,
    responseContract: buildResponseContract(event.source, sessionMode),
    userInput: event.text,
  };
}
