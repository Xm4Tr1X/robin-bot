# Robin — Command Reference

All commands are sent as messages to Robin (Slack DM, channel @mention, or CLI input). Deterministic commands are handled instantly without an LLM call.

---

## Session

| Command | Description |
|---|---|
| `summarize context` | Show what Robin is tracking for this conversation |
| `what are you tracking` | Alias |
| `reset session` | Clear session state |

## Response mode

| Command | Description |
|---|---|
| `reply mode` | Post replies directly (default) |
| `draft mode` | Wrap replies in a draft block for review |
| `observe mode` | Suppress replies; Robin tracks context silently |

## Assistant mode

| Command | Description |
|---|---|
| `mode orchestrated` | Full pipeline — memory, persona, safety gates (default) |
| `mode claude-direct` | Minimal envelope — raw text; safety gates still enforced |
| `mode status` | Show current assistant mode |

## Snapshot

| Command | Description |
|---|---|
| `save snapshot` | Persist session and todo state to disk |
| `discard snapshot` | Clear snapshot and wipe todo ledger |

## Todos

| Command | Example | Description |
|---|---|---|
| `show todos` | | List active todos |
| `list todos` / `my todos` | | Alias |
| `add todo: <task>` | `add todo: Fix auth bug [high]` | Add a todo. Tags: `[high]`, `[low]`, `[long-term]` |
| `mark done: <id>` | `mark done: abc12345` | Mark done |
| `mark blocked: <id>` | | Mark blocked |
| `mark in-progress: <id>` | | Mark in-progress |

**Natural language on CLI:** Robin auto-executes todo commands it suggests — no copy-paste required.

## Mentions

| Command | Description |
|---|---|
| `mentions list` | List tracked mentions |
| `mentions stale` | Show mentions older than 7 days |
| `mentions triage <id>` | Mark triaged |
| `mentions dismiss <id>` | Dismiss |
| `mentions done <id>` | Mark done |

## Todo approval

| Command | Description |
|---|---|
| `todo pending` | List todos waiting for approval |
| `todo approve <id>` | Approve and add to ledger |
| `todo reject <id>` | Reject |

## Alerts

| Command | Description |
|---|---|
| `alert list` | List all alerts |
| `alert open` | List open alerts |
| `alert ack <id>` | Acknowledge |
| `alert resolve <id>` | Resolve |
| `alert profile add <channelId> <keywords>` | Watch a channel |
| `alert profile remove <channelId>` | Stop watching |
| `alert profile list` | Show active profiles |

## Comms drafts

| Command | Example | Description |
|---|---|---|
| `comms list templates` | | Available templates |
| `comms draft <templateId> key=value …` | `comms draft incident-update title="DB outage" status=investigating` | Render draft |

Built-in templates: `incident-update`, `weekly-summary`, `deployment-notice`.

## Staged actions (medium-risk approval)

| Command | Description |
|---|---|
| `staged list` | List actions pending approval |
| `approve <id>` | Approve and post the staged action |
| `reject <id>` | Reject and discard |

## MCP connections

| Command | Example | Description |
|---|---|---|
| `mcp add <name> <endpoint>` | `mcp add GitHub https://api.github.com/mcp` | Register |
| `mcp validate <id>` | | Validate endpoint |
| `mcp test <id>` | | Run connectivity test |
| `mcp enable <id>` | | Enable (requires test) |
| `mcp disable <id>` | | Disable |
| `mcp list` | | Show all connections |

State machine: `pending → validated → tested → enabled`.

> MCP servers from `~/.claude.json` (coralogix-mcp, github) load automatically — no registration needed.

## Access policy

| Command | Example | Description |
|---|---|---|
| `policy show` | | Display current policy |
| `policy set <field> <value>` | `policy set allowConversationsWithOthers true` | Update |
| `policy help` | | Show settable fields |

**Settable fields:** `ownerUserId`, `allowConversationsWithOthers`, `allowDmFromOthers`, `allowMentionsFromOthers`, `allowedUserIds`, `allowedChannelIds`

---

## Access control order

1. No `ownerUserId` configured → deny
2. Actor is owner → **allow**
3. Source is `cli` or `system` → **allow**
4. `allowConversationsWithOthers = false` → deny
5. Slack DM + `allowDmFromOthers = false` → deny
6. Slack mention + `allowMentionsFromOthers = false` → deny
7. `allowedUserIds` non-empty + actor not in list → deny
8. `allowedChannelIds` non-empty + channel not in list → deny
9. → **allow**
