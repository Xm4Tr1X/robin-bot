/**
 * Canonical contracts for Robin.
 * This is the single source of truth for all cross-module interfaces.
 * All modules import types from here — never re-declare them locally.
 */

// ---------------------------------------------------------------------------
// Ingress
// ---------------------------------------------------------------------------

export type IngressSource = 'slack' | 'slack_shadow' | 'cli' | 'telegram' | 'whatsapp' | 'system';

export interface IngressEvent {
  id: string;
  source: IngressSource;
  actorId: string;
  channelId?: string;
  conversationId: string;
  threadId?: string;
  text: string;
  ts: string;
  metadata?: Record<string, unknown>;
}

export interface IngressAdapter {
  start(onEvent: (event: IngressEvent) => Promise<void>): Promise<void>;
  stop(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Prompt Orchestration
// ---------------------------------------------------------------------------

export type TaskClass = 'general' | 'todo' | 'alert' | 'comms' | 'ops';
export type ResponseFormat = 'markdown' | 'slack_mrkdwn' | 'plain';

export interface ResponseContract {
  format: ResponseFormat;
  allowExternalLinks: boolean;
  maxLength?: number;
}

export interface PromptEnvelope {
  taskClass: TaskClass;
  persona: string;
  policyConstraints: string[];
  memoryContext: string[];
  channelContext: string[];
  allowedTools: string[];
  responseContract: ResponseContract;
  userInput: string;
}

// ---------------------------------------------------------------------------
// LLM Runner
// ---------------------------------------------------------------------------

export interface RunnerRequest {
  requestId: string;
  sessionId?: string;
  envelope: PromptEnvelope;
  timeoutMs: number;
  /**
   * Robin-managed MCP connections (HTTP-only, via mcp add/validate/test/enable).
   * Resolved to HTTP McpServerConfig before being passed to the SDK.
   */
  mcpServers?: Array<{ name: string; endpoint: string }>;
  /**
   * Pre-formatted MCP server configs read from ~/.claude.json.
   * Passed directly to the Claude Agent SDK as-is — supports stdio, http,
   * and streamable-http transports. Tokens come from the file at runtime;
   * nothing is stored in Robin's config or source code.
   */
  nativeMcpServers?: Record<string, unknown>;
}

export interface RunnerResponse {
  requestId: string;
  sessionId: string;
  text: string;
  toolTrace: Array<{ tool: string; summary: string }>;
  usage?: { inputTokens?: number; outputTokens?: number; costUsd?: number };
}

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

export interface PolicyDecision {
  allow: boolean;
  reason?: string;
  redactions?: Array<{ kind: string; from: string; to: string }>;
}

export interface AccessContext {
  actorId: string;
  source: IngressSource;
  channelId?: string;
  conversationId: string;
  ownerUserId: string;
  allowConversationsWithOthers: boolean;
  allowDmFromOthers: boolean;
  allowMentionsFromOthers: boolean;
  allowedUserIds: string[];
  allowedChannelIds: string[];
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export type CommandType =
  | 'mode'
  | 'todo'
  | 'mentions'
  | 'alert'
  | 'policy'
  | 'mcp'
  | 'upgrade'
  | 'snapshot'
  | 'session';

export interface CommandResult {
  handled: boolean;
  reply?: string;
  commandType?: CommandType;
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export type AuditOutcome = 'allowed' | 'denied' | 'redacted' | 'blocked';

export interface AuditEvent {
  event_type: string;
  actor_id: string;
  timestamp: string;
  correlation_id: string;
  outcome: AuditOutcome;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------

export interface MemoryEntry {
  id: string;
  conversationId?: string;
  scope?: 'conversation' | 'global';
  kind: 'constraint' | 'decision' | 'objective' | 'pending_action' | 'summary' | 'preference' | 'behavioral_pattern';
  content: string;
  createdAt: string;
  expiresAt?: string;
}

// ---------------------------------------------------------------------------
// Assistant Response
// ---------------------------------------------------------------------------

export interface AssistantResponse {
  requestId: string;
  conversationId: string;
  text: string;
  isDraft: boolean;
  toolTrace: Array<{ tool: string; summary: string }>;
}
