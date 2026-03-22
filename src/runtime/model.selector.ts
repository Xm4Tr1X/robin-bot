/**
 * ModelSelector — decides which provider and model to use for a given request.
 *
 * Two providers:
 *   fireworks — open source models (kimi2.5, glm5) via OpenAI-compatible API
 *               no MCP tools — MCP requires the Claude Agent SDK
 *   claude    — Claude models via Agent SDK
 *               full MCP + Agent (subagent) tool support
 *
 * Routing logic:
 *   user override   — "use kimi", "use opus", "with glm", "sonnet:" etc. at prompt start
 *   kimi-k2p5       — well-defined executions: todo updates, clear short requests
 *   glm-5           — thoughtful analysis without tools: explanations, "why", summaries
 *   claude-haiku    — fast tasks needing read/search tools (no MCP)
 *   claude-sonnet   — anything needing MCP servers (coralogix, github, k8s, etc.)
 *   claude-opus     — deep reasoning, "think deeply", "think through"
 *
 * MCP note: Fireworks models do not support MCP natively. Any task that needs
 * coralogix, github, spinnaker, or other MCP servers must use Claude Sonnet.
 */

import type { TaskClass } from '../contracts';
import type { RiskLevel } from '../policy/risk.classifier';

export type ModelProvider = 'fireworks' | 'claude';

export interface ModelSelection {
  provider: ModelProvider;
  model: string;
  /** Short label shown in CLI display */
  displayName: string;
  /** Whether this selection was user-overridden */
  userOverride?: boolean;
}

// Fireworks model IDs
export const KIMI_MODEL    = 'accounts/fireworks/models/kimi-k2p5';
export const GLM_MODEL     = 'accounts/fireworks/models/glm-5';

// Claude model IDs
export const CLAUDE_HAIKU  = 'claude-haiku-4-5-20251001';
export const CLAUDE_SONNET = 'claude-sonnet-4-6';
export const CLAUDE_OPUS   = 'claude-opus-4-6';

// ---------------------------------------------------------------------------
// Keyword patterns
// ---------------------------------------------------------------------------

// These tasks need MCP servers — must use Claude Sonnet
const MCP_SIGNALS = /\b(coralogix|github|spinnaker|gandalf|k8s|kubernetes|pod|namespace|devrev|alert|incident|outage|spike|p99|p95|error rate|latency|logs|traces|metrics|dashboard|sql|redash|investigate|deployment|rollout)\b/i;

// These tasks need read/search tools but not MCP — can use Claude Haiku
const TOOL_SIGNALS = /\b(search|find in|look at|read|grep|browse|web|look up|what does .* say)\b/i;

// Deep analytical thinking without tools — GLM5
const DEEP_SIGNALS = /\b(think through|explain why|root cause|analyze|reasoning|understand|walk me through|architecture|strategy|brainstorm|why (is|does|did|are|were)|how (does|do|should|would))\b/i;

// Heavy reasoning — Opus
const OPUS_SIGNALS = /\b(think deeply|complex|critical decision|long.?term|strategic|from first principles)\b/i;

// Todo-style well-defined operations — Kimi2.5
const TODO_SIGNALS = /\b(done|unblocked|finished|completed|mark|rename|change|update|add task|remove task|it.?s done|already done|close it|close the|resolved)\b/i;

// ---------------------------------------------------------------------------
// User model override — detected from prompt prefix
// ---------------------------------------------------------------------------

const USER_OVERRIDES: Array<{ pattern: RegExp; resolve: (routing: RoutingConfig) => ModelSelection }> = [
  { pattern: /\b(use kimi|with kimi|kimi:|kimi2\.?5)\b/i,     resolve: (r) => fireworks(r.actionModel ?? KIMI_MODEL, 'kimi-k2p5', true) },
  { pattern: /\b(use glm|with glm|glm:|glm.?5)\b/i,            resolve: (r) => fireworks(r.reviewerModel ?? GLM_MODEL, 'glm-5', true) },
  { pattern: /\b(use haiku|with haiku|haiku:)\b/i,             resolve: () => claude(CLAUDE_HAIKU, true) },
  { pattern: /\b(use sonnet|with sonnet|sonnet:)\b/i,          resolve: (r) => claude(r.defaultModel ?? CLAUDE_SONNET, true) },
  { pattern: /\b(use opus|with opus|opus:|think deeply|use claude opus)\b/i, resolve: (r) => claude(r.reasoningModel ?? CLAUDE_OPUS, true) },
  { pattern: /\b(use fireworks|fireworks:)\b/i,                resolve: (r) => fireworks(r.actionModel ?? KIMI_MODEL, 'kimi-k2p5', true) },
  { pattern: /\b(use claude|claude:)\b/i,                      resolve: (r) => claude(r.defaultModel ?? CLAUDE_SONNET, true) },
];

interface RoutingConfig {
  enabled: boolean;
  defaultModel?: string;
  reasoningModel?: string;
  actionModel?: string;
  reviewerModel?: string;
}

// ---------------------------------------------------------------------------
// Main selector
// ---------------------------------------------------------------------------

export function selectModel(
  taskClass: TaskClass,
  riskLevel: RiskLevel,
  text: string,
  modelRouting: RoutingConfig | null,
  /** Additional context (e.g. thread messages) — checked for routing signals alongside text. */
  contextText?: string,
): ModelSelection {
  // Routing disabled → always Claude default
  if (!modelRouting?.enabled) {
    return claude(modelRouting?.defaultModel ?? CLAUDE_SONNET);
  }

  const r: RoutingConfig = modelRouting;

  // Combined signal text: user message + thread context (if present)
  const fullSignal = contextText ? `${text}\n${contextText}` : text;

  // 1. User override — check first, highest priority
  for (const { pattern, resolve } of USER_OVERRIDES) {
    if (pattern.test(text)) return resolve(r);
  }

  // 2. Opus signals
  if (OPUS_SIGNALS.test(fullSignal)) return claude(r.reasoningModel ?? CLAUDE_OPUS);

  // 3. MCP signals → always Claude Sonnet (checks thread context too)
  if (MCP_SIGNALS.test(fullSignal) || taskClass === 'alert') return claude(r.defaultModel ?? CLAUDE_SONNET);

  // 4. Tool signals → Claude Haiku (read/search, no MCP)
  if (TOOL_SIGNALS.test(fullSignal)) return claude(CLAUDE_HAIKU);

  // 5. High-risk → Claude
  if (riskLevel === 'high') return claude(r.defaultModel ?? CLAUDE_SONNET);

  // 6. Deep thinking without tools → GLM5
  if (DEEP_SIGNALS.test(fullSignal)) return fireworks(r.reviewerModel ?? GLM_MODEL, 'glm-5');

  // 7. Todo / well-defined operations → Kimi2.5
  if (taskClass === 'todo' || TODO_SIGNALS.test(text)) return fireworks(r.actionModel ?? KIMI_MODEL, 'kimi-k2p5');

  // 8. Low-risk general → Kimi2.5
  if (riskLevel === 'low') return fireworks(r.actionModel ?? KIMI_MODEL, 'kimi-k2p5');

  // 9. Default → Claude Sonnet
  return claude(r.defaultModel ?? CLAUDE_SONNET);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fireworks(model: string, label: string, override = false): ModelSelection {
  return { provider: 'fireworks', model, displayName: `${label} · fireworks`, userOverride: override };
}

function claude(model: string, override = false): ModelSelection {
  const label = model.includes('haiku') ? 'haiku'
    : model.includes('opus') ? 'opus'
    : 'sonnet';
  return { provider: 'claude', model, displayName: `${label} · claude`, userOverride: override };
}
