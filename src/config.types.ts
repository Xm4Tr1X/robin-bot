/**
 * Types for robin.json (OpenClaw-style config).
 * Secret refs resolve from process.env at startup.
 */

export type SecretRefSource = 'env';

export interface SecretRef {
  source: SecretRefSource;
  /** Env var name, e.g. SLACK_BOT_TOKEN */
  id: string;
}

/** A value is either a literal string or a secret reference (resolved from env). */
export type SecretInput = string | SecretRef;

export function isSecretRef(value: unknown): value is SecretRef {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'source' in value &&
    (value as SecretRef).source === 'env' &&
    typeof (value as SecretRef).id === 'string'
  );
}

/** Default mode for new threads. */
export type DefaultMode = 'observe' | 'reply' | 'draft';
export type ModelRoutingStrategy = 'single' | 'rule-based' | 'cascaded';
export type TelemetryLevel = 'minimal' | 'standard' | 'verbose';
export type TelemetrySink = 'stdout' | 'jsonl';

/**
 * Raw config file shape (robin.json).
 * All secrets should use SecretRef in the file; resolved config has plain strings.
 */
export interface RobinConfigFile {
  /** Feature flags (booleans). */
  features?: {
    /** Enable Slack (Socket Mode). If false, runs CLI-only. */
    slackEnabled?: boolean;
    /** Enable cron check-ins (morning/evening). */
    checkInsEnabled?: boolean;
    /** (Future) Require owner approval for task execution. */
    ownerApprovalRequired?: boolean;
    /** (Future) Run tools in sandbox. */
    sandboxEnabled?: boolean;
    /** (Future) Redact secrets before send/persist. */
    redactionBeforeSend?: boolean;
  };

  /** Enums / multi-way options. */
  options?: {
    /** Default mode for new sessions. */
    defaultMode?: DefaultMode;
    /** (Future) sessionPersistence: 'memory' | 'durable' */
  };

  /** Task-aware model routing policy (planner/executor/reviewer style). */
  modelRouting?: {
    /** Enable dynamic routing between models by task class/depth. */
    enabled?: boolean;
    /** Routing strategy. */
    strategy?: ModelRoutingStrategy;
    /** Default model for generic requests. */
    defaultModel?: string;
    /** Model for high-depth reasoning/planning tasks. */
    reasoningModel?: string;
    /** Model for action execution/tool-heavy deterministic steps. */
    actionModel?: string;
    /** Model for output review/safety pass before send (optional). */
    reviewerModel?: string;
    /** Escalation threshold (0..1) for cascaded routing. */
    escalationThreshold?: number;
    /** Rule-based routing: task class -> model. */
    rules?: Array<{
      taskClass:
        | 'qa'
        | 'reasoning'
        | 'planning'
        | 'tool-action'
        | 'comms-draft'
        | 'pr-create'
        | 'incident-triage';
      model: string;
    }>;
  };

  /** Telemetry configuration for logs/metrics/traces/events. */
  telemetry?: {
    enabled?: boolean;
    level?: TelemetryLevel;
    sink?: TelemetrySink;
    /** Used when sink=jsonl. */
    jsonlPath?: string;
    /** Sampling ratio [0..1]. */
    sampleRate?: number;
    /** Redact prompt/user content in telemetry payloads. */
    redactPromptContent?: boolean;
    trackTokenUsage?: boolean;
    trackCost?: boolean;
    trackToolCalls?: boolean;
    trackModelRouting?: boolean;
  };

  /** Paths and non-secret settings. */
  settings?: {
    /** Directory for snapshot and session files. */
    snapshotDir?: string;
    /** Owner Slack user ID (for DMs and approval). */
    ownerUserId?: string;
    /** Channel ID for check-in messages (optional; falls back to ownerUserId). */
    checkinChannel?: string;
    /** Max Claude turns per Slack message. */
    maxTurns?: number;
    /** Tool names allowed for Claude (e.g. Read, Bash, Glob, Grep, WebSearch, WebFetch). */
    allowedTools?: string[];
    /** Path to the SQLite database file. Defaults to ./data/robin.db. */
    dbPath?: string;
    /** Port for the web dashboard. Defaults to 3000. */
    webPort?: number;
    /** Slack channel IDs Robin should passively shadow (owner activity only). Defaults to []. */
    shadowChannels?: string[];
    /** Tool allowlist per risk level. Keys: low, medium, high. */
    toolPolicy?: {
      low?: string[];
      medium?: string[];
      high?: string[];
    };
  };

  /**
   * Secret references. Resolved from process.env at startup.
   * In file use { "source": "env", "id": "VAR_NAME" }; never put plaintext secrets in robin.json.
   */
  secrets?: {
    /** Slack Bot (OAuth) token. */
    slackBotToken?: SecretInput;
    /** Slack App-level token (Socket Mode). */
    slackAppToken?: SecretInput;
    /** Fireworks AI API key for open source model routing. */
    fireworksApiKey?: SecretInput;
  };

  /** Optional: inline env vars (only applied when env var is missing; never override). OpenClaw-style. */
  env?: Record<string, string>;
}

/**
 * Resolved config: secrets and env are resolved to strings; used at runtime.
 */
export interface RobinConfigResolved {
  features: Required<RobinConfigFile['features']> & {
    slackEnabled: boolean;
    checkInsEnabled: boolean;
    ownerApprovalRequired: boolean;
    sandboxEnabled: boolean;
    redactionBeforeSend: boolean;
  };
  options: {
    defaultMode: DefaultMode;
  };
  modelRouting: {
    enabled: boolean;
    strategy: ModelRoutingStrategy;
    defaultModel: string;
    reasoningModel: string;
    actionModel: string;
    reviewerModel: string;
    escalationThreshold: number;
    rules: Array<{
      taskClass:
        | 'qa'
        | 'reasoning'
        | 'planning'
        | 'tool-action'
        | 'comms-draft'
        | 'pr-create'
        | 'incident-triage';
      model: string;
    }>;
  };
  telemetry: {
    enabled: boolean;
    level: TelemetryLevel;
    sink: TelemetrySink;
    jsonlPath: string;
    sampleRate: number;
    redactPromptContent: boolean;
    trackTokenUsage: boolean;
    trackCost: boolean;
    trackToolCalls: boolean;
    trackModelRouting: boolean;
  };
  settings: {
    snapshotDir: string;
    dbPath: string;
    ownerUserId: string;
    checkinChannel: string;
    maxTurns: number;
    allowedTools: string[];
    webPort: number;
    shadowChannels: string[];
    toolPolicy: { low: string[]; medium: string[]; high: string[] } | null;
  };
  secrets: {
    slackBotToken: string;
    slackAppToken: string;
    fireworksApiKey: string;
  };
}
