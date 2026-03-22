# Robin Bot — Technical Patterns

## Multi-Model Routing Architecture

Two `RunnerClient` implementations behind a shared interface:

```ts
interface RunnerClient {
  run(request: RunnerRequest): Promise<RunnerResponse>;
}
```

- `AgentSdkRunnerClient` — Claude models via `@anthropic-ai/claude-agent-sdk`. Supports MCP servers, subagents, tool use. Used when thread/task context signals MCP need.
- `FireworksRunnerClient` — OpenAI-compatible HTTP call to Fireworks AI. No tools, no MCP. Fast (~1-5s). Used for todo updates, quick Q&A, analytical tasks.

`model.selector.ts` takes `(taskClass, riskLevel, text, contextText?)` and returns `{ provider, model, displayName }`. `contextText` includes thread messages — "check this" in a Coralogix thread routes to Sonnet even though the text has no keywords.

`runner.factory.ts` returns the appropriate client. When `modelRouting.enabled = false`, the injected `runnerClient` is used directly (preserves test behaviour).

## Thread Context Injection

On `app_mention` in a Slack thread:
1. Adapter calls `fetchThreadContext(client, channelId, threadTs, { includeBots: true })` — **bot messages included** because alerts come from bots
2. Result stored in `event.metadata.threadMessages`
3. `assistant.service.ts` passes thread messages to `selectModel()` (routing signal) and `buildPromptEnvelope()` (LLM context)
4. `envelopeToPromptString()` includes `[thread context]` block before the User: line

Thread continuation (no @mention needed after Robin has replied):
- `message` handler checks `getSession(chId, thId).agentSessionId`
- If set: Robin has been in this thread → pass message through without @mention

## ledgerHolder Pattern (Critical)

`src/todo.ts` exports `ledgerHolder: { instance: TodoLedger }` — NOT a singleton export.
`initTodoLedger(store)` seeds from SQLite on startup.
All callers use `ledgerHolder.instance.*`.

```ts
// Correct
import { ledgerHolder } from '../todo'
ledgerHolder.instance.add(...)
// Wrong — stale reference if module is reloaded
import { ledger } from '../todo'
```

## Todo Natural Language Execution (CLI)

After LLM responds on `cli` or `system` source:
1. `extractTodoCommands(responseText)` — finds `add todo:`, `mark done:`, etc. in code blocks, inline backticks, plain lines
2. `executeTodoCommands(commands)` — runs against `ledgerHolder.instance`
3. Result appended to reply: `_Done — executed automatically: ..._`

No copy-paste required on CLI.

## Global vs Conversation Memory

- Conversation-scoped: `getForConversation(conversationId)` — per thread, 30-day retention
- Global-scoped: `getGlobal()` — owner preferences and behavioral patterns, no conversationId
- Global patterns injected as `[owner context] [preference/behavioral_pattern] ...` before conversation-local memory in every prompt

Nightly synthesis (`SynthesisScheduler`):
1. Fetches recent activity from `ActivityService`
2. Calls `PatternSynthesizer` (uses `SandboxLlmClient` directly, no tools)
3. Deduplicates against existing global patterns
4. Writes new preferences/patterns to `MemoryService.addGlobal()`

## Safety Gate Ordering

Pre-LLM (`safetyPrecheck`):
1. Secrets in userInput → deny
2. Secrets in memoryContext → deny
3. Forbidden tools in allowedTools (`Write`, `Edit`, `NotebookEdit`, `Bash`) → **hard block** (not warn)
4. Input > 10000 chars → deny

Post-LLM (`safetyPostcheck` + `personaGuard`):
- Redacts secrets from response text
- Blocks reasoning leaks and identity violations
- Failure blocks publish, emits safe fallback

## Prompt Envelope → Prompt String

`envelopeToPromptString()` builds:
```
[Mode: reply]
[Policy: none]
[Memory:
  [owner context] [preference] prefers bullet points
  [decision] use TypeScript everywhere]
[Active tools: Read, Glob, Grep]
[current todos]
  • [`abc12345`] *task name* — high | todo
[thread context — messages above in this Slack thread]
  [1] CRITICAL alert from Coralogix...

User: check this
```

Extra channelContext items (todos, thread) are appended after `[Active tools]` and before `User:`.

## Session Mode (Two Axes)

| Axis | Values | Controls |
|---|---|---|
| `session.mode` | `reply` (default), `draft`, `observe` | Whether/how to publish reply |
| `session.assistantMode` | `orchestrated` (default), `claude-direct` | How prompt envelope is built |

Default mode is now `reply` (not `observe`) — changed so Slack and CLI both respond by default.

## SQLite Store

Uses built-in `node:sqlite` (Node 22+). `better-sqlite3` does NOT build on Node 24.
Tables: `todos`, `memory_entries`, `mentions`, `alerts`, `alert_profiles`, `mcp_connections`, `staged_actions`, `owner_activity`.

## ActivityBus (CLI Display)

Global singleton, no-op until subscribed. `startCliRenderer()` subscribes in `startCli()`.

Event kinds: `ingress`, `shadow`, `runner_start`, `tool_call`, `completing`, `reply`.

`runner_start` carries `displayName` (e.g. `kimi-k2p5 · fireworks`) — shown before spinner.
`tool_call` events stream as they happen inside the Agent SDK loop.
`completing` stops the spinner.

## MCP from ~/.claude.json

`loadClaudeCodeMcpServers()` reads `~/.claude.json` at startup. Returns `NativeMcpServers` (stdio + http + streamable-http). Passed as `nativeMcpServers` to `AgentSdkRunnerClient`. Tokens never leave `~/.claude.json`.

Only the Claude path uses MCP. `FireworksRunnerClient` receives no MCP servers.
