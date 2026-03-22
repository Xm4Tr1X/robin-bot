# Robin Implementation Plan (Agent-Facing)

## Document Contract

This document is for implementation agents.  
It defines technical contracts, sequencing, acceptance gates, and review loops to realize the architecture in `ARCHITECTURE.md`.

## Locked Requirements

- Multi-channel operation in parallel (Slack + CLI at minimum).
- Single shared assistant core and shared durable state.
- OWNER-first access controls.
- Draft-only autonomy for sensitive operations.
- 30-day retention with auto-prune.
- Sandbox-isolated LLM runtime component.
- Slack-first MVP (external systems deferred).
- No self-mutation (proposal-only upgrades).
- Claude SDK permission mode may remain `bypassPermissions`; therefore Robin policy gates are the hard enforcement layer.

## Repository Anchor Points

- `src/index.ts` (current startup/mode handling)
- `src/robin.ts` (current orchestration path)
- `src/config.ts` and `src/config.types.ts` (config contracts)
- `src/claude.ts` (current LLM bridge)
- `src/session.ts` and `src/todo.ts` (state model baseline)

## Target Module Map

Create/refactor to this layout:

- `src/ingress/`
  - `slack.adapter.ts`
  - `cli.adapter.ts`
  - `adapter.contract.ts`
- `src/core/`
  - `event.router.ts`
  - `assistant.service.ts`
  - `command.router.ts`
- `src/policy/`
  - `access.policy.ts`
  - `safety.precheck.ts`
  - `safety.postcheck.ts`
  - `persona.guard.ts`
- `src/memory/`
  - `memory.service.ts`
  - `memory.retriever.ts`
  - `memory.writeback.ts`
- `src/prompting/`
  - `prompt.builder.ts`
  - `prompt.contract.ts`
  - `persona.registry.ts`
- `src/runtime/`
  - `runner.client.ts`
  - `runner.contract.ts`
- `src/store/`
  - `store.contract.ts`
  - `sqlite.store.ts`
  - `migrations/`
- `src/features/`
  - `mentions/`
  - `todos/`
  - `alerts/`
  - `comms/`
  - `mcp/`
  - `upgradePlanner/`

## Canonical Contracts

These interfaces are source-of-truth. Implement them in `src/contracts.ts` (or `src/types/contracts.ts`) and import from there only.

## 1) Ingress Event

```ts
type IngressSource = 'slack' | 'cli' | 'telegram' | 'whatsapp' | 'system';

interface IngressEvent {
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
```

## 2) Prompt Envelope

```ts
interface PromptEnvelope {
  taskClass: 'general' | 'todo' | 'alert' | 'comms' | 'ops';
  persona: string;
  policyConstraints: string[];
  memoryContext: string[];
  channelContext: string[];
  allowedTools: string[];
  responseContract: {
    format: 'markdown' | 'slack_mrkdwn' | 'plain';
    allowExternalLinks: boolean;
    maxLength?: number;
  };
  userInput: string;
}
```

## 3) LLM Request/Response

```ts
interface RunnerRequest {
  requestId: string;
  sessionId?: string;
  envelope: PromptEnvelope;
  timeoutMs: number;
}

interface RunnerResponse {
  requestId: string;
  sessionId: string;
  text: string;
  toolTrace: Array<{ tool: string; summary: string }>;
  usage?: { inputTokens?: number; outputTokens?: number; costUsd?: number };
}
```

## 4) Policy Decision

```ts
interface PolicyDecision {
  allow: boolean;
  reason?: string;
  redactions?: Array<{ kind: string; from: string; to: string }>;
}
```

## Execution Sequence

## Phase A: Core Refactor Foundation

1. Move Slack-specific setup and callbacks from `src/index.ts` into `src/ingress/slack.adapter.ts`.
2. Move CLI readline loop from `src/index.ts` into `src/ingress/cli.adapter.ts`.
3. Each adapter exposes `start(onEvent: (event: IngressEvent) => Promise<void>)`.
4. Create `src/core/event.router.ts` with a single `route(event)` entrypoint.
5. Replace mutually exclusive startup with parallel adapter startup (start both when enabled).
6. Ensure adapters never call LLM directly.

Acceptance:
- Slack + CLI can run together.
- Both produce normalized events.
- No direct LLM calls from adapters.

## Phase B: Policy and Access Control

1. Add OWNER-first config fields:
   - `allowConversationsWithOthers`
   - `allowDmFromOthers`
   - `allowMentionsFromOthers`
   - `allowedUserIds`
   - `allowedChannelIds`
2. Implement `access.policy` gate before any command/LLM logic.
3. Add deny responses and audit events.
4. Enforce evaluation order:
   - owner match => allow,
   - else check allow flags,
   - else allowlist checks,
   - else deny.
5. If `ownerUserId` is empty, deny owner-gated actions with explicit diagnostics.
6. Add config validation forbidding secret-like keys in non-secret env config blocks.

Acceptance:
- Non-owner requests are denied by default.
- Owner requests always pass.
- Policy decisions are auditable.

## Phase C: Durable Store and Retention

1. Implement store contract and SQLite backend.
2. Migrate todos/session metadata/mentions/alerts into durable tables.
3. Add daily retention pruner (30 days) and migration versioning.

Acceptance:
- restart does not lose required state.
- retention prunes on schedule.
- schema migration is deterministic.

## Phase D: Memory and Prompting Separation

1. Move memory retrieval/writeback to `memory.service`.
2. Build prompt envelopes in `prompt.builder`.
3. Add persona registry and response contracts.
4. Remove direct prompt composition from ingress/core routing.

Acceptance:
- prompt composition is isolated.
- memory logic is isolated.
- prompt envelope can be unit-tested without transport dependencies.

## Phase E: Safety Gates (Pre/Post)

1. Implement `src/redaction.ts` with baseline patterns (tokens/keys/private URLs/auth headers).
2. Add `safety.precheck` before runner call:
   - forbidden tool/action checks,
   - sensitive context suppression.
3. Add `safety.postcheck` + `persona.guard` after response:
   - redaction,
   - policy compliance,
   - format compliance.
4. Approval bypass defense: approval state changes must come only from explicit command handlers, never inferred from model text.
5. Fail closed on any safety check failure.

Acceptance:
- any precheck violation blocks runner call.
- any postcheck violation blocks outbound publish.
- redaction runs before ingestion persistence and before outbound publish.

## Phase F: Sandboxed LLM Runtime

1. Introduce `runner.client` contract in app process.
2. Add containerized runner component with strict boundaries:
   - no host filesystem write access,
   - controlled mount points,
   - network egress restrictions,
   - resource limits and timeouts.
3. Replace direct `query()` call path with runner client path.
4. Add hardening checklist:
   - no privileged mode,
   - read-only filesystem where possible,
   - explicit mount policy,
   - explicit network allowlist,
   - resource limits.

Acceptance:
- LLM execution path is isolated.
- host access restrictions are verified.
- failures degrade gracefully with safe error replies.

## Phase G: Feature Pipelines

### Mentions
- lifecycle tracking (`new`, `triaged`, `converted`, `dismissed`, `done`).
- stale mention nudges.

### Todos
- confidence-gated extraction from mention threads.
- explicit approval/rejection flows.
- cross-channel shared visibility.

### Alerts (Slack-first)
- channel ingestion profiles.
- triage (`noise`, `investigate`, `critical`).
- draft-only response artifacts.

### Comms/Docs
- template-driven drafts using shared context.
- mandatory redaction pass before output.

### MCP Assistant
- `mcp add`, `mcp validate`, `mcp test`, `mcp enable|disable`.
- explicit approval before apply.
- disabled-by-default until test passes.

### Upgrade Planner
- propose-only recommendations with risk/effort/rollback sections.
- no autonomous app mutation.

## Phase H: Mode and UX Contracts

### Modes
- `orchestrated` (default)
- `claude-direct` (minimal mediation, safety still enforced)

### Command Surface
- `mode ...`
- `todo ...`
- `mentions ...`
- `alert ...`
- `policy ...`
- `mcp ...`
- `upgrade plan`

Acceptance:
- commands are deterministic and testable.
- no mode bypasses safety/policy boundaries.

## Observability and Audit

- Structured logs with correlation IDs.
- Event-level telemetry for routing, policy, runner latency, and token/cost summaries.
- Audit events for:
  - policy denials,
  - sensitive actions,
  - MCP onboarding changes,
  - mode changes.
- Audit schema minimum:
  - `event_type`, `actor_id`, `timestamp`, `correlation_id`, `outcome`.
- Never log secrets or full prompt bodies.
- Telemetry must default to redacted prompt content.

## Test Matrix

Definition of green:
- unit tests pass,
- integration tests pass,
- failure-injection tests produce safe fallback behavior without process crash.

## Unit
- event normalization
- command parsing
- access policy decisions
- prompt builder output
- safety pre/post filters
- retention pruning

## Integration
- Slack + CLI simultaneous ingestion
- owner/other-user policy behavior
- end-to-end prompt envelope through runner client
- draft-only enforcement for alerts/comms
- MCP onboarding flow

## Failure Injection
- Slack API failures
- store write failures
- runner timeout/error
- redaction false-negative regression checks

## Release Gates

Gate 1: Multi-ingress + policy stable  
Gate 2: Durable state + retention stable  
Gate 3: Prompt/memory separation complete  
Gate 4: Safety gates enforced end-to-end  
Gate 5: Sandboxed runner in use  
Gate 6: Feature pipelines + tests green

No gate can be skipped.

## Rollback Gates

- Phase A rollback: adapter toggles can disable one/both ingress paths via config.
- Phase B rollback: policy config revert without schema rollback.
- Phase C rollback: restore from store backup and revert app build if migration issues occur.
- Phase D/E rollback: code revert to previous prompt/safety path.
- Phase F rollback: runner-client fallback path must return safe unavailable response; do not fall back silently to unsafe execution.
- Phase G/H rollback: feature flags must allow disable without data corruption.

## Review-Rewrite Protocol (Mandatory)

Run 4 review passes before implementation freeze:

1. Architecture coherence review (boundary correctness).
2. Safety/security review (policy and sandbox strictness).
3. Reliability/operability review (failure behavior and rollback).
4. Agent execution review (ambiguity removal in steps/contracts).

For each pass:
- produce findings,
- apply revisions,
- re-check acceptance criteria.
- persist findings as markdown in `docs/review-findings-<pass>.md` during implementation cycles.

Implementation starts only after all 4 passes are green.

## Deferred (Post-MVP)

- external incident adapters (PagerDuty/Datadog/AWS)
- semantic vector retrieval (if RAG-lite signal quality is insufficient)
- multi-user team mode with scoped policies
- daemon/service deployment profile beyond local-first
