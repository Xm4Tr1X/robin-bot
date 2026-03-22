# Robin Bot — Service Boundaries

## What This Service Is

Robin is a single-owner personal AI assistant reachable over Slack and a local CLI simultaneously. It runs on a local machine (single-user, single-tenant). All channels share one assistant core, one durable SQLite store, and one todo ledger. Conversation-local context is partitioned by channel+thread.

## Language & Runtime

- TypeScript, Node v24.13.0
- `@anthropic-ai/claude-agent-sdk` — agent SDK for main LLM runtime
- `@anthropic-ai/sdk` — direct Messages API for sandbox mode only
- `@slack/bolt` — Slack Socket Mode ingress
- `node:sqlite` (built-in, Node 22+) — durable store; better-sqlite3 does NOT build on Node 24
- `node-cron` — scheduled jobs
- Vitest v2.1+ — test framework

## Top-Level Module Boundaries

| Module | Responsibility | Must NOT |
|---|---|---|
| `src/ingress/` | Transport decoding only; emits `IngressEvent` | Call LLM directly |
| `src/core/` | Route events: policy → command → assistant | Own transport logic |
| `src/policy/` | Access control, safety gates, redaction, persona guard | Emit replies |
| `src/prompting/` | Build `PromptEnvelope`; persona registry | Call runner |
| `src/memory/` | CRUD + retrieval + writeback | Build prompts |
| `src/runtime/` | Wrap Claude Agent SDK; return `RunnerResponse` | Own policy logic |
| `src/store/` | Durable persistence contract + SQLite + in-memory | Know domain entities |
| `src/features/` | Feature pipelines (todos, mentions, alerts, comms, mcp, mode, policy, staging) | Bypass safety gates |
| `src/audit/` | Structured JSON audit events to stderr | Persist to store |
| `src/web/` | Express dashboard (port 3000) | Know Slack transport |
| `src/sandbox/` | Raw LLM chat, no pipeline, no tools | Import pipeline modules |

## Critical Invariants

- `src/contracts.ts` is the single source of truth for all cross-module interfaces. Never redefine types elsewhere.
- Safety gates FAIL CLOSED: deny on error or uncertainty; never silent pass-through.
- Memory writeback ONLY after post-check + persona guard pass.
- OWNER-first: `ownerUserId` must be set; CLI/system sources are always trusted.
- Approval bypass defense: approval state changes must come only from explicit command handlers, never inferred from model text.
- `ledgerHolder.instance` (not a singleton import) is the live todo ledger — always use this reference.

## Entry Points

- `src/shadow/` — Phase J–K: ActivityService (owner_activity table), PatternSynthesizer (LLM compression), SynthesisScheduler (nightly cron), ThreadFetcher (Slack API)
- `src/features/staging/` — Phase L: StagingService (staged_actions table), staging commands (approve/reject/staged list)
- `src/policy/risk.classifier.ts` — Phase L: RiskLevel classification (low/medium/high) by keyword + tool trace

- `src/index.ts` — parallel startup: Slack + CLI adapters both start when enabled
- `src/web/server.ts` — `createWebServer(store)` factory; started by `initTodoLedger`
- `src/sandbox/index.ts` — sandbox CLI entrypoint (no pipeline)
- `ROBIN_CLI=true npm run dev` — force CLI even when Slack tokens are present
