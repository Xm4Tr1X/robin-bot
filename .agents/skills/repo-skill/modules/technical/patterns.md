# Robin Bot — Technical Patterns

## Store: ledgerHolder Pattern (Critical)

`src/todo.ts` exports `ledgerHolder: { instance: TodoLedger }` — NOT a singleton.
`initTodoLedger(store)` is called in bootstrap and seeds todos from SQLite.
All callers (`robin.ts`, `session.ts`, `command.router.ts`) use `ledgerHolder.instance.*`.

Why: allows test code to swap the instance without module re-import.

```ts
// Correct
import { ledgerHolder } from '../todo'
ledgerHolder.instance.add(...)

// Wrong — stale reference
import { ledger } from '../todo'
```

## Memory: Conversation-Scoped (Current) vs Global (Phase K)

Currently `MemoryService.getForConversation(conversationId)` — all memory is per-thread.
Phase K adds global scope: `scope: 'conversation' | 'global'` on `MemoryEntry`, `conversationId` becomes optional.
`buildPromptEnvelope` must pull global memory in addition to conversation-local memory.

## Safety Gate Failure Modes

Pre-LLM (`safetyPrecheck`):
- Blocks if userInput or memoryContext contains secrets (token/key patterns via `containsSecrets()`)
- Blocks if input > 10000 chars
- Currently WARNS (does not block) on forbidden tools in allowedTools — Phase L fixes this to block

Post-LLM (`safetyPostcheck`):
- Runs redaction on response text before publish
- Blocks if redaction finds unredacted secrets in output

Forbidden tools currently: `Write`, `Edit`, `NotebookEdit`, `Bash` — warn-only.
Phase L changes forbidden tool detection to hard block.

## Event Router: taskOnly Flag

`EventRouterConfig.taskOnly = true` makes the router reject free-form messages that don't match deterministic commands. Used for Slack ingress where Robin should only handle task commands, not freeform chat.

Phase J adds a second early-exit: `event.source === 'slack_shadow'` skips everything and writes to ActivityService silently.

## Session Mode vs Assistant Mode (Two Separate Axes)

These are often confused:

| Axis | Values | Controls |
|---|---|---|
| `session.mode` (response mode) | `observe`, `reply`, `draft` | Whether/how to publish the reply |
| `session.assistantMode` | `orchestrated`, `claude-direct` | How the prompt envelope is built |

`observe` mode: LLM still runs (in current code), reply is suppressed.
`draft` mode: reply is wrapped in a draft block — does NOT hold back tool execution.

## SQLite Store: node:sqlite Not better-sqlite3

Uses built-in `node:sqlite` (Node 22+). better-sqlite3 does not build on Node 24.
Schema migrations are versioned in `src/store/migrations/`.
Tables auto-created on first use via `store.upsert()`.

## Sandbox Mode Isolation

`src/sandbox/llm.client.ts` uses `@anthropic-ai/sdk` Messages API directly — no agent SDK, no tools, no pipeline bypass. Used by:
1. `npm run dev:sandbox` — user-facing raw chat
2. Phase K `PatternSynthesizer` — calls Claude to compress observations into patterns

Never import sandbox modules from the main pipeline.

## Web Dashboard

Express on `127.0.0.1:3000` (default). `ROBIN_WEB_PORT` env or `settings.webPort` overrides.
`createWebServer(store)` factory — does not start automatically, called by `initTodoLedger`.
30-second polling on frontend. Source badges: Slack (deep-link), CLI, Web.
Settings API allowlist: only `features`, `options`, `settings` keys — never `secrets`.

## Phase G Feature Pipeline Pattern

Each feature follows: `{name}.types.ts` → `{name}.service.ts` → `{name}.commands.ts`.
Services are injected via `FeatureServices` interface in `command.router.ts`.
Commands return `CommandResult { handled: boolean, reply?: string, commandType }`.
Services never call the LLM — all LLM work goes through `AssistantService`.

## Audit Service

`auditService` singleton emits structured JSON to stderr.
Wired into: event.router (access.denied), assistant.service (runner.telemetry), mode.commands (mode.changed), mcp.service (mcp.action), comms.service (comms.draft.generated).
Redacts secrets in metadata before emit.
Schema minimum: `event_type`, `actor_id`, `timestamp`, `correlation_id`, `outcome`.
