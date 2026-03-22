# Robin Bot — Service Boundaries

## What This Service Is

Robin is a single-owner personal AI assistant (TypeScript, Node 24) reachable over Slack Socket Mode, a local CLI, and a web dashboard simultaneously. Single-user, single-tenant, local machine deployment. All channels share one assistant core, one durable SQLite store, and one todo ledger.

## Language & Runtime

- TypeScript, Node v24.13.0
- `@anthropic-ai/claude-agent-sdk` — Agent SDK for Claude path (MCP, subagents, tool use)
- `@anthropic-ai/sdk` — direct Messages API for sandbox and test scripts
- `@anthropic-ai/vertex-sdk` — Vertex AI backend for test scripts
- `@slack/bolt` — Slack Socket Mode ingress
- `node:sqlite` (built-in, Node 22+) — durable store; better-sqlite3 does NOT build on Node 24
- `node-cron` — scheduled synthesis job
- Fireworks AI (OpenAI-compatible) — open source model routing (kimi2.5, glm5)
- Vitest v2.1+ — test framework, 561 tests

## Module Boundaries

| Module | Responsibility | Must NOT |
|---|---|---|
| `src/ingress/` | Transport decoding; emits `IngressEvent` | Call LLM directly |
| `src/core/` | Route events: policy → command → assistant | Own transport logic |
| `src/display/` | ActivityBus + CLI renderer | Know about routing decisions |
| `src/policy/` | Access control, safety gates, redaction, persona guard | Emit replies |
| `src/prompting/` | Build `PromptEnvelope`; persona registry | Call runner |
| `src/memory/` | Memory CRUD + retrieval + writeback | Build prompts |
| `src/runtime/` | RunnerClient implementations + model selector + factory | Own policy logic |
| `src/shadow/` | Activity recording, pattern synthesis, thread fetching | Know about sessions |
| `src/mcp/` | Load `~/.claude.json` MCP server configs | Store credentials |
| `src/store/` | DurableStore contract + SQLite + in-memory | Know domain entities |
| `src/features/` | Feature pipelines (todos, mentions, alerts, comms, mcp, mode, policy, staging) | Bypass safety gates |
| `src/audit/` | Structured JSON audit events to stderr | Persist to store |
| `src/web/` | Express dashboard (port 4888) | Know Slack transport |
| `src/sandbox/` | Raw LLM chat, no pipeline | Import pipeline modules |

## Critical Invariants

- `src/contracts.ts` — single source of truth for all cross-module interfaces; never redefine elsewhere
- Safety gates FAIL CLOSED — deny on error; no silent pass-through
- Memory writeback ONLY after post-check + persona guard pass
- OWNER-first: `ownerUserId` must be set; CLI/system sources always trusted
- `ledgerHolder.instance.*` — always use this reference, not a direct import
- MCP tokens from `~/.claude.json` — passed to SDK at runtime, never stored in Robin's config

## Entry Points

- `src/index.ts` — parallel startup: Slack + CLI both start when enabled; nodemon watches src/ in dev
- `src/web/server.ts` — `createWebServer(store)` factory
- `src/sandbox/index.ts` — sandbox CLI (no pipeline)
- `ROBIN_CLI=true npm run dev` — force CLI only
