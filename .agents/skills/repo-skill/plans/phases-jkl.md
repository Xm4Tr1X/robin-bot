# Phases J–K–L Implementation Plan

## Execution Status (as of 2026-03-21)

| Task | Status | Tests added |
|---|---|---|
| J1 Shadow channel config | DONE | 7 |
| J2 Activity store | DONE | 10 |
| J3 Slack adapter shadow listener | DONE | 8 |
| J4 Event router shadow path | DONE | 7 |
| J5 Thread context enrichment | DONE | 5 |
| K1 Global memory scope | DONE | 10 |
| K2 Pattern memory kinds + prompt injection | DONE | 8 |
| K3 Pattern synthesizer | DONE | 8 |
| K4 Synthesis scheduler | DONE | 6 |
| K5 Persona update | DONE | 0 |
| L1 Risk classifier | DONE | 21 |
| L2 Tool allowlist by risk level | DONE | 5 |
| L3 Fix forbidden tool gate | DONE | 5 |
| L4 Staged execution | DONE | 14 |
| L5 Docs update | DONE | 0 |

Total: 537 tests passing (was 443). 94 new tests added. All phases J–L complete.

## Context

Robin Phases A–I are complete (443 tests, 31 files). This plan covers the next three phases:

- **Phase J**: Slack Shadow Observation — Robin passively records owner activity in configured channels without being @-mentioned
- **Phase K**: Global Memory & Pattern Synthesis — Robin learns behavioral patterns across sessions via a scheduled summarization loop
- **Phase L**: Selective Approval Gate — Robin executes low-risk tasks autonomously; stages high-risk ones for explicit approval

TDD throughout: write failing test → implement → green → next task.
Architecture doc (`docs/ARCHITECTURE.md`) updated after each phase completes.

---

## Phase J: Slack Shadow Observation

### J1 — Shadow channel config

**Test file:** `tests/unit/config/shadow.config.test.ts`

Tests:
- `shadowChannels` defaults to `[]` when absent from robin.json
- valid channel IDs (`["C012345", "C067890"]`) round-trip through `readRawConfig` / `writeRawConfig`
- unrelated keys are not touched during write

**Implementation:**
- `src/config.ts` / config types — add `shadowChannels?: string[]` to `RobinConfigFile` and `RobinConfigResolved`
- Default to `[]` in `resolveConfig()`

**Acceptance:** `npm run test:unit` green; TypeScript compiles clean.

---

### J2 — Activity store

**Test file:** `tests/unit/shadow/activity.service.test.ts`

Tests:
- `record()` persists `ActivityRecord` to store and returns it with generated id + createdAt
- `listRecent(5)` returns at most 5 records, newest first
- `listRecent(0)` returns all records
- `prune(olderThanMs)` removes entries older than cutoff; returns count
- duplicate ts+channelId upserts (does not duplicate)

**New files:**
- `src/shadow/activity.types.ts` — `ActivityRecord { id, channelId, actorId, text, ts, threadTs?, threadContext?, createdAt }`
- `src/shadow/activity.service.ts` — `ActivityService` class: `record()`, `listRecent(n)`, `prune(olderThanMs)`

**Acceptance:** tests green; no changes to existing modules required.

---

### J3 — Slack adapter: channel message listener

**Test file:** `tests/unit/ingress/slack.adapter.shadow.test.ts`

Tests:
- channel message from owner (`actorId === ownerUserId`) in a `shadowChannel` emits event with `source: 'slack_shadow'`
- channel message from non-owner is ignored (no event emitted)
- channel message from owner NOT in `shadowChannels` is ignored
- IM messages still route normally (existing adapter tests must still pass)
- `threadTs` is preserved in emitted event metadata
- bot messages (`bot_id` present) are ignored even if user matches

**Implementation:**
- `src/contracts.ts` — add `'slack_shadow'` to `IngressSource` union
- `src/ingress/slack.adapter.ts` — new `app.message` handler for non-IM messages; guards: `channel_type !== 'im'`, `actorId === ownerUserId`, `channelId` in `shadowChannels`, no `bot_id`

**Acceptance:** all adapter tests green; `IngressSource` union updated.

---

### J4 — Event router: silent shadow path

**Test file:** `tests/unit/core/event.router.shadow.test.ts`

Tests:
- shadow event calls `activityService.record()` with correct fields
- shadow event never invokes the `reply` callback
- shadow event bypasses access policy check entirely
- shadow event bypasses command router
- non-shadow event path is unaffected (all existing event.router tests pass)
- missing `activityService` in config: shadow events are silently dropped (no crash)

**Implementation:**
- `src/core/event.router.ts` — early-exit branch at top of `route()`: if `event.source === 'slack_shadow'`, record to activityService and return
- `EventRouterConfig` — add `activityService?: ActivityService`

**Acceptance:** tests green; no existing tests broken.

---

### J5 — Thread context enrichment

**Test file:** `tests/unit/shadow/thread.fetcher.test.ts`

Tests:
- returns array of message texts from mocked `conversations.replies` API response
- own bot messages are filtered out of thread context
- API error returns empty array (graceful fallback, no throw)
- empty thread returns empty array

**New file:** `src/shadow/thread.fetcher.ts` — `fetchThreadContext(client, channelId, threadTs): Promise<string[]>`

**Wire into:**
- `src/ingress/slack.adapter.ts` — when shadow event has `threadTs`, call `fetchThreadContext` and attach result as `metadata.threadContext`
- `src/shadow/activity.service.ts` — `ActivityRecord.threadContext?: string` (joined array)

**Architecture doc update:** add shadow observation data flow to `docs/ARCHITECTURE.md`.

**Acceptance:** tests green; architecture doc updated.

---

## Phase K: Global Memory & Pattern Synthesis

### K1 — Global memory scope

**Test file:** `tests/unit/memory/global.memory.test.ts`

Tests:
- `addGlobal()` stores entry without `conversationId`; `scope === 'global'`
- `getGlobal()` returns only `scope: 'global'` entries
- `getForConversation()` still returns only conversation-scoped entries
- `prune()` respects both scopes (expires global entries too)
- existing memory tests all still pass

**Implementation:**
- `src/contracts.ts` — add `scope?: 'conversation' | 'global'` to `MemoryEntry`; make `conversationId` optional
- `src/memory/memory.service.ts` — `addGlobal(kind, content)`, `getGlobal()`, `getByKindGlobal(kind)`

**Acceptance:** tests green; no existing memory tests broken.

---

### K2 — Pattern memory kinds & prompt injection

**Test file:** `tests/unit/memory/pattern.retriever.test.ts`

Tests:
- `preference` entries formatted as `[preference] ...` in `formatMemoryContext`
- `behavioral_pattern` entries formatted as `[pattern] ...`
- `buildPromptEnvelope` includes global memory when `globalEntries` provided
- global patterns appear before conversation-local memory in `memoryContext` array
- empty global entries don't add empty lines to envelope

**Implementation:**
- `src/contracts.ts` — extend `MemoryEntry.kind` union: add `'preference'` and `'behavioral_pattern'`
- `src/memory/memory.retriever.ts` — format new kinds distinctly
- `src/prompting/prompt.builder.ts` — accept `globalEntries?: MemoryEntry[]` in `PromptBuildInput`; prepend as `[owner context]` block
- `src/core/assistant.service.ts` — fetch `memoryService.getGlobal()` and pass to `buildPromptEnvelope`

**Acceptance:** tests green; TypeScript clean.

---

### K3 — Pattern synthesizer

**Test file:** `tests/unit/shadow/pattern.synthesizer.test.ts`

Tests:
- with empty activity records returns `{ noChange: true, preferences: [], patterns: [] }`
- extracts `preferences` from mocked LLM JSON response
- extracts `behavioral_pattern` entries from mocked LLM response
- malformed/non-JSON LLM response returns `{ noChange: true }` (no throw)
- dedups patterns already present in `existingPatterns` (case-insensitive)
- LLM client error returns `{ noChange: true }` (no throw)

**New file:** `src/shadow/pattern.synthesizer.ts`
- `PatternSynthesisResult { preferences: string[], patterns: string[], noChange: boolean }`
- `PatternSynthesizer` class wrapping `src/sandbox/llm.client.ts` (direct Messages API, no tools, no pipeline)
- Prompt: structured extraction request; expects JSON `{ preferences: string[], patterns: string[] }`

**Acceptance:** tests green; synthesizer is pure (no side effects on `MemoryService`).

---

### K4 — Synthesis scheduler

**Test file:** `tests/unit/shadow/synthesis.scheduler.test.ts`

Tests:
- scheduler calls `activityService.listRecent(batchSize)` on tick
- new patterns from synthesizer are written to `memoryService.addGlobal()`
- `noChange: true` result skips all memory writes
- synthesizer error is caught; scheduler does not crash; logs error
- `batchSize` defaults to 50 when not configured

**New file:** `src/shadow/synthesis.scheduler.ts`
- `startSynthesisScheduler({ activityService, memoryService, synthesizer, schedule, batchSize })`
- Uses `node-cron` (already a dep)
- Default schedule: `"0 2 * * *"` (nightly 2am)

**Config:**
- `robin.json` options: `synthesisCron` (string, default `"0 2 * * *"`), `synthesisBatchSize` (number, default 50)
- `src/config.ts` — add both fields to `RobinConfigResolved`

**Wire into:** `src/index.ts` — start scheduler after `initTodoLedger`

**Acceptance:** tests green; scheduler wired but not running in tests (mocked cron).

---

### K5 — Persona: pattern-aware system prompt

**Test file:** extend `tests/unit/prompting/prompt.builder.test.ts`

Tests:
- global patterns appear as `[owner context]` prefix block in `memoryContext`
- empty global patterns produce no `[owner context]` block
- conversation-local memory appears after global context

**Implementation:**
- `src/prompting/persona.registry.ts` — add note to `ROBIN_PERSONA` system prompt: "Honour any `[owner context]` patterns present in memory context."
- `src/prompting/prompt.builder.ts` — label global patterns block clearly

**Architecture doc update:** add pattern synthesis data flow to `docs/ARCHITECTURE.md`.

**Acceptance:** tests green; architecture doc updated.

---

## Phase L: Selective Approval Gate

### L1 — Task risk classifier

**Test file:** `tests/unit/policy/risk.classifier.test.ts`

Tests (table-driven):
- `"search for X"` → `low`
- `"show todos"` → `low`
- `"summarize this thread"` → `low`
- `"draft a message"` → `low`
- `"send a message to #channel"` → `medium`
- `"post this to Slack"` → `medium`
- `"write a file"` → `high`
- `"edit config.ts"` → `high`
- `"run bash command"` → `high`
- `"execute the script"` → `high`
- tool names in `toolTrace`: `['Write']` escalates to `high`
- tool names in `toolTrace`: `['Bash']` escalates to `high`
- empty text → `low`
- ambiguous text → `medium`

**New file:** `src/policy/risk.classifier.ts`
- `type RiskLevel = 'low' | 'medium' | 'high'`
- `classifyRisk(text: string, toolTrace?: string[]): RiskLevel`
- Keyword matching then tool trace escalation

**Acceptance:** tests green; pure function, no imports from other modules.

---

### L2 — Tool allowlist by risk level

**Test file:** `tests/unit/core/assistant.risk.test.ts`

Tests:
- low-risk task: envelope contains only read-only tools (`Read`, `Glob`, `Grep`, `WebSearch`, `WebFetch`)
- high-risk task: envelope contains empty tool list
- medium-risk task: envelope contains read-only tools; response is staged not replied
- missing `toolPolicy` in config: falls back to existing `allowedTools` flat list

**Implementation:**
- `src/contracts.ts` — add `riskLevel: RiskLevel` to `PromptEnvelope`
- `src/prompting/prompt.builder.ts` — accept `riskLevel` in `PromptBuildInput`
- `src/core/assistant.service.ts` — classify risk before building envelope; pick tool list from `toolPolicy[riskLevel]`
- `AssistantServiceConfig` — add `toolPolicy?: Record<RiskLevel, string[]>`

**Config (robin.json):**
```json
"toolPolicy": {
  "low":    ["Read", "Glob", "Grep", "WebSearch", "WebFetch"],
  "medium": ["Read", "Glob", "Grep", "WebSearch", "WebFetch"],
  "high":   []
}
```

**Acceptance:** tests green; TypeScript clean.

---

### L3 — Fix forbidden tool gate: warn → block

**Test file:** extend `tests/unit/policy/safety.precheck.test.ts`

Tests:
- envelope with `Write` in `allowedTools` → `PolicyDecision { allow: false }` (currently returns allow — this test must fail first)
- envelope with `Bash` in `allowedTools` → denied
- envelope with `Edit` in `allowedTools` → denied
- envelope with only `["Read", "Glob"]` → allowed (existing tests)
- envelope with `NotebookEdit` → denied

**Implementation:**
- `src/policy/safety.precheck.ts` — replace `console.warn` with `return deny('forbidden tool in allowedTools: ...')` for any tool in `FORBIDDEN_TOOLS`

**Acceptance:** tests green; existing allow tests still pass.

---

### L4 — Staged execution for medium-risk tasks

**Test files:**
- `tests/unit/features/staging/staging.service.test.ts`
- `tests/unit/features/staging/staging.commands.test.ts`

**staging.service tests:**
- `stage()` persists `StagedAction` with status `pending`; returns it with generated id
- `approve(id)` returns staged text; marks record `approved`
- `reject(id)` marks record `rejected`; returns confirmation string
- `approve(unknown-id)` returns error string
- `listPending()` returns only `pending` entries

**staging.commands tests:**
- `"approve abc12345"` → calls `stagingService.approve(id)`
- `"reject abc12345"` → calls `stagingService.reject(id)`
- `"staged list"` → calls `stagingService.listPending()`; formats output
- unrecognised text → `{ handled: false }`

**New files:**
- `src/features/staging/staged.action.ts` — `StagedAction { id, conversationId, text, riskLevel, createdAt, status: 'pending'|'approved'|'rejected' }`
- `src/features/staging/staging.service.ts` — `StagingService`: `stage()`, `approve()`, `reject()`, `listPending()`
- `src/features/staging/staging.commands.ts` — `routeStagingCommand(text, stagingService)`

**Wire into:**
- `src/core/command.router.ts` — add `stagingService?: StagingService` to `FeatureServices`; call `routeStagingCommand`
- `src/core/event.router.ts` — medium-risk `AssistantResponse` is staged via `stagingService.stage()` instead of replied; reply with "Action staged — `approve <id>` to proceed."

**Acceptance:** tests green; approve/reject commands work end-to-end.

---

### L5 — Docs update

- Update `docs/ARCHITECTURE.md`: add risk classification branch in event flow diagram
- Update `README.md`: add `approve <id>`, `reject <id>`, `staged list` to command table; add `shadowChannels` and `toolPolicy` to config example
- Update `src/config.ts` types: add `shadowChannels`, `toolPolicy`, `synthesisCron`, `synthesisBatchSize`

**Acceptance:** `npx tsc --noEmit` clean; README config example matches actual config types.

---

## Test File Map (all new files)

```
tests/unit/config/shadow.config.test.ts
tests/unit/shadow/activity.service.test.ts
tests/unit/shadow/thread.fetcher.test.ts
tests/unit/shadow/pattern.synthesizer.test.ts
tests/unit/shadow/synthesis.scheduler.test.ts
tests/unit/ingress/slack.adapter.shadow.test.ts
tests/unit/core/event.router.shadow.test.ts
tests/unit/memory/global.memory.test.ts
tests/unit/memory/pattern.retriever.test.ts
tests/unit/policy/risk.classifier.test.ts
tests/unit/core/assistant.risk.test.ts
tests/unit/features/staging/staging.service.test.ts
tests/unit/features/staging/staging.commands.test.ts
```

## New Source File Map

```
src/shadow/activity.types.ts
src/shadow/activity.service.ts
src/shadow/thread.fetcher.ts
src/shadow/pattern.synthesizer.ts
src/shadow/synthesis.scheduler.ts
src/features/staging/staged.action.ts
src/features/staging/staging.service.ts
src/features/staging/staging.commands.ts
src/policy/risk.classifier.ts
```

## Files Modified

```
src/contracts.ts                    — IngressSource, MemoryEntry, PromptEnvelope
src/config.ts                       — shadowChannels, toolPolicy, synthesisCron, synthesisBatchSize
src/ingress/slack.adapter.ts        — shadow channel message listener
src/core/event.router.ts            — shadow early-exit, staging branch
src/core/assistant.service.ts       — risk classification, toolPolicy selection
src/core/command.router.ts          — staging commands
src/memory/memory.service.ts        — global scope methods
src/memory/memory.retriever.ts      — new kind formatting
src/prompting/prompt.builder.ts     — global memory injection
src/prompting/persona.registry.ts   — pattern-aware system prompt
src/policy/safety.precheck.ts       — forbidden tool warn → block
src/index.ts                        — synthesis scheduler startup
docs/ARCHITECTURE.md                — shadow + pattern + risk classification flows
README.md                           — new commands + config fields
```
