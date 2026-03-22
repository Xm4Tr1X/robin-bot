# Robin

Personal Slack assistant powered by Claude. One assistant core reachable through Slack and a local CLI simultaneously, with a shared todo ledger, session memory, and structured access control.

---

## How Robin works

```
Slack / CLI
     │
     ▼
  Ingress Adapters          normalize events → IngressEvent
     │
     ▼
  Access Policy             OWNER-first; deny non-owners by default
     │
     ▼
  Command Router            deterministic commands matched first, no LLM needed
     │  └── unmatched
     ▼
  Assistant Service         builds prompt envelope → safety precheck → LLM runner
     │                      → safety postcheck → persona guard → reply
     ▼
  Reply (Slack / CLI)
```

**Key properties:**

- **OWNER-first** — the owner's messages always pass; everyone else is denied by default unless explicitly enabled.
- **Deterministic commands first** — todo, mode, policy, MCP, and session commands are matched by regex before any LLM call.
- **Safety gates, fail closed** — inputs with secrets are blocked before the LLM; outputs with secrets or persona violations are blocked before the reply.
- **Draft-only for sensitive operations** — alert responses and comms drafts require explicit approval before being treated as final.
- **Shared state** — todos and preferences are shared across Slack and CLI. Session context is local to each conversation thread.
- **Passive shadowing** — Robin silently watches configured Slack channels for owner activity and records it. A nightly synthesis loop compresses observations into preferences and behavioral patterns that are injected into every future prompt.
- **Risk-gated tools** — each request is classified as low/medium/high risk before the LLM is called; tool allowlists are selected per risk level so destructive tools are never available for high-risk requests.
- **Live CLI display** — the terminal shows a spinner while the LLM works, tool calls as they stream, ingress events from all sources (Slack, web, shadow), and passive observations in real time.

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create `.env`

```env
ANTHROPIC_API_KEY=sk-ant-...

# Only required when Slack is enabled:
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
```

### 3. Create `robin.json`

```json
{
  "settings": {
    "ownerUserId": "UXXXXXXXX",
    "allowedTools": ["Read", "Glob", "Grep", "WebSearch", "WebFetch"],
    "dbPath": "./data/robin.db",
    "webPort": 3000,
    "shadowChannels": ["C012345ABC", "C067890DEF"],
    "toolPolicy": {
      "low":    ["Read", "Glob", "Grep", "WebSearch", "WebFetch"],
      "medium": ["Read", "Glob", "Grep", "WebSearch", "WebFetch"],
      "high":   []
    }
  },
  "features": {
    "slackEnabled": true,
    "checkInsEnabled": false
  },
  "options": {
    "defaultMode": "observe",
    "synthesisCron": "0 2 * * *",
    "synthesisBatchSize": 50
  },
  "secrets": {
    "slackBotToken": { "source": "env", "id": "SLACK_BOT_TOKEN" },
    "slackAppToken": { "source": "env", "id": "SLACK_APP_TOKEN" }
  }
}
```

- `shadowChannels` — Slack channel IDs Robin watches passively (owner messages only, no replies sent).
- `toolPolicy` — tool allowlists per risk level. `high: []` means no tools for destructive requests.
- `synthesisCron` — cron schedule for the nightly pattern synthesis loop (default: `0 2 * * *`).
- `synthesisBatchSize` — how many recent activity records to feed the synthesizer per run (default: 50).

`ownerUserId` is your Slack user ID (found in your Slack profile → `...` → Copy member ID).

---

## Running Robin

```bash
# Full bot — Slack + CLI in parallel
npm run dev

# CLI only (forces CLI even if Slack tokens are present)
ROBIN_CLI=true npm run dev

# Sandbox mode — raw Claude chat, no pipeline, no tools
npm run dev:sandbox

# Web dashboard (opens browser to http://localhost:3000)
npm run web
```

After `npm run build`, use `npm start` for the compiled version.

---

## Commands

All commands are sent as messages to Robin (Slack DM or channel mention, or CLI input). Deterministic commands are handled instantly without an LLM call.

### Session

| Command | Description |
|---|---|
| `summarize context` | Show what Robin is currently tracking for this conversation |
| `what are you tracking` | Alias for summarize context |
| `reset session` | Clear session state for this conversation |

### Response mode

Controls how Robin posts replies in the current conversation.

| Command | Description |
|---|---|
| `reply mode` | Post replies directly (default when active) |
| `draft mode` | Wrap all LLM replies in a draft block for review |
| `observe mode` | Suppress LLM replies; Robin tracks context silently |

### Assistant mode

Controls how Robin builds prompts before calling the LLM.

| Command | Description |
|---|---|
| `mode orchestrated` | Full pipeline — memory retrieval, persona, safety gates (default) |
| `mode claude-direct` | Minimal envelope — raw text to Claude; safety gates still enforced |
| `mode status` | Show the current assistant mode for this conversation |

### Snapshot

| Command | Description |
|---|---|
| `save snapshot` | Persist current session and todo state to disk |
| `discard snapshot` | Clear the saved snapshot and wipe the todo ledger |

### Todos

| Command | Example | Description |
|---|---|---|
| `show todos` | `show todos` | List all active todos |
| `list todos` | | Alias |
| `my todos` | | Alias |
| `add todo: <task>` | `add todo: Fix auth bug [high]` | Add a todo. Tags: `[high]`, `[low]`, `[long-term]` |
| `add task: <task>` | | Alias |
| `mark done: <id>` | `mark done: abc12345` | Mark a todo as done |
| `mark blocked: <id>` | `mark blocked: abc12345` | Mark a todo as blocked |
| `mark in-progress: <id>` | `mark in-progress: abc12345` | Mark a todo as in-progress |

Todo priority defaults to `medium`; bucket defaults to `short-term`. Tags in the task name are stripped from the task title.

### Mentions

| Command | Description |
|---|---|
| `mentions list` | List all tracked mentions |
| `mentions stale` | Show mentions older than 7 days with no action |
| `mentions triage <id>` | Mark a mention as triaged |
| `mentions dismiss <id>` | Dismiss a mention |
| `mentions done <id>` | Mark a mention as done |

### Todo approval

Proposed todos extracted from mention threads are held for review.

| Command | Description |
|---|---|
| `todo pending` | List todos waiting for approval |
| `todo approve <id>` | Approve and add to the main todo ledger |
| `todo reject <id>` | Reject the proposed todo |

### Alerts

| Command | Description |
|---|---|
| `alert list` | List all alerts (open and acked) |
| `alert open` | List open alerts only |
| `alert ack <id>` | Acknowledge an alert |
| `alert resolve <id>` | Resolve an alert |
| `alert profile add <channelId> <keywords>` | Watch a channel for alert keywords |
| `alert profile remove <channelId>` | Stop watching a channel |
| `alert profile list` | Show all active channel profiles |

### Comms drafts

| Command | Example | Description |
|---|---|---|
| `comms list templates` | | Show available templates |
| `comms draft <templateId> key=value ...` | `comms draft incident-update title="DB outage" status=investigating impact=high eta=2h description="Replica lag"` | Render a template as a draft |

Built-in templates: `incident-update`, `weekly-summary`, `deployment-notice`. All drafts are mandatory — comms is never sent directly. Secrets in variable values are automatically redacted.

### MCP connections

Robin manages its own MCP connection registry. Connections must pass validation and testing before they can be enabled.

| Command | Example | Description |
|---|---|---|
| `mcp add <name> <endpoint>` | `mcp add GitHub https://api.github.com/mcp` | Register a new MCP connection |
| `mcp validate <id>` | `mcp validate abc12345` | Validate the endpoint |
| `mcp test <id>` | `mcp test abc12345` | Run a connectivity test (requires validation) |
| `mcp enable <id>` | `mcp enable abc12345` | Enable the connection (requires testing) |
| `mcp disable <id>` | `mcp disable abc12345` | Disable an active connection |
| `mcp list` | | Show all connections and their status |

State machine: `pending → validated → tested → enabled`. Connections are disabled by default until the full sequence passes.

### Upgrade planner

| Command | Description |
|---|---|
| `upgrade plan` | Show a proposal for the next upgrade phase with risk/effort/rollback notes |
| `upgrade help` | Show upgrade planner usage |

Robin never applies upgrades autonomously — all output is proposal-only.

### Staged actions

Medium-risk LLM responses are held for review instead of being replied immediately.

| Command | Example | Description |
|---|---|---|
| `staged list` | | List all actions waiting for approval |
| `approve <id>` | `approve abc12345` | Approve and post the staged action |
| `reject <id>` | `reject abc12345` | Reject and discard the staged action |

### Access policy (runtime)

| Command | Example | Description |
|---|---|---|
| `policy show` | | Display the current access policy |
| `policy set <field> <value>` | `policy set allowConversationsWithOthers true` | Update a policy field |
| `policy help` | | Show settable fields |

**Settable fields:**

| Field | Type | Description |
|---|---|---|
| `ownerUserId` | string | Slack user ID of the owner |
| `allowConversationsWithOthers` | `true` / `false` | Allow non-owner messages |
| `allowDmFromOthers` | `true` / `false` | Allow DMs from non-owners |
| `allowMentionsFromOthers` | `true` / `false` | Allow channel mentions from non-owners |
| `allowedUserIds` | comma-separated | Specific users to allow (e.g. `U111,U222`) |
| `allowedChannelIds` | comma-separated | Specific channels to allow |

---

## Access control

Robin enforces an OWNER-first policy on every request, evaluated in order:

1. No `ownerUserId` configured → deny (with diagnostic)
2. Actor is the owner → **allow**
3. Source is `cli` or `system` → **allow** (local sources are trusted)
4. `allowConversationsWithOthers = false` → deny
5. Slack DM + `allowDmFromOthers = false` → deny
6. Slack mention + `allowMentionsFromOthers = false` → deny
7. `allowedUserIds` is non-empty and actor not in list → deny
8. `allowedChannelIds` is non-empty and channel not in list → deny
9. → **allow**

All denials are logged as structured `access.denied` audit events with correlation IDs.

---

## Web dashboard

The web dashboard at `http://localhost:3000` (or the port set in `settings.webPort`) shows:

- Active todos with source badges (Slack, CLI, Web)
- Settings editor for non-secret config fields

Open it with:

```bash
npm run web
```

The dashboard polls every 30 seconds. Todos added via the web have source `web`.

---

## Development

```bash
# Run all tests
npm test

# Unit tests only
npm run test:unit

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

Tests use Vitest. No real Slack connection or LLM calls are made — adapters and the runner client are mocked.

---

## Project layout

```
src/
  audit/           Structured audit event emission (access, mode, MCP, comms, runner)
  core/            EventRouter, CommandRouter, AssistantService
  features/
    alerts/        Alert ingestion, triage, and channel profiles
    comms/         Template-driven comms drafts with mandatory redaction
    mcp/           MCP connection lifecycle (add/validate/test/enable/disable)
    mentions/      Mention lifecycle tracking
    mode/          Assistant mode commands (orchestrated / claude-direct)
    policy/        Runtime-mutable access policy
    todos/         Confidence-gated todo approval
    upgradePlanner Propose-only upgrade recommendations
  ingress/         Slack and CLI adapters
  memory/          Memory CRUD, retrieval, and writeback
  policy/          Access control, safety gates, persona guard, redaction
  prompting/       Prompt envelope builder, persona registry, response contracts
  runtime/         Runner client (Claude Agent SDK wrapper)
  sandbox/         Standalone raw-LLM chat mode (no pipeline)
  store/           DurableStore contract, SQLite and in-memory implementations
  web/             Express web dashboard (todos + settings API)
```

---

## Safety guarantees

- **Secrets never stored or logged** — redaction runs on all LLM inputs, outputs, audit metadata, and comms draft variables before any persistence or reply.
- **Safety gates fail closed** — any pre-LLM or post-LLM check failure blocks the request and returns a safe error reply. No silent pass-through.
- **Persona guard** — responses claiming false identity or attempting prompt injection are blocked post-LLM.
- **Draft-only autonomy** — alerts and comms drafts require explicit approval. Robin never sends comms directly.
- **No self-mutation** — upgrade proposals are text output only; Robin cannot modify its own code or config autonomously.
