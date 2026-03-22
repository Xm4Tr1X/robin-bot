# Robin — Configuration

---

## Environment variables (`.env`)

```env
# Required always
ANTHROPIC_API_KEY=sk-ant-...      # or configure Vertex below

# Vertex (Google Cloud) — alternative to direct API key
CLAUDE_CODE_USE_VERTEX=1
ANTHROPIC_VERTEX_PROJECT_ID=your-project-id
CLOUD_ML_REGION=global

# Slack (required when slackEnabled: true)
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...

# Fireworks AI — open source model routing
FIREWORKS_API_KEY=fw_...

# Overrides
ROBIN_WEB_PORT=4888              # web dashboard port (default: 3000)
ROBIN_CLI=true                   # force CLI only, skip Slack
```

---

## robin.json

```json
{
  "settings": {
    "ownerUserId": "UXXXXXXXX",
    "allowedTools": ["Read", "Glob", "Grep", "WebSearch", "WebFetch"],
    "dbPath": "./data/robin.db",
    "webPort": 4888,
    "shadowChannels": ["C012345ABC"],
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
    "defaultMode": "reply",
    "synthesisCron": "0 2 * * *",
    "synthesisBatchSize": 50
  },
  "modelRouting": {
    "enabled": true,
    "defaultModel": "claude-sonnet-4-6",
    "reasoningModel": "claude-opus-4-6",
    "actionModel": "accounts/fireworks/models/kimi-k2p5",
    "reviewerModel": "accounts/fireworks/models/glm-5"
  },
  "secrets": {
    "slackBotToken": { "source": "env", "id": "SLACK_BOT_TOKEN" },
    "slackAppToken": { "source": "env", "id": "SLACK_APP_TOKEN" },
    "fireworksApiKey": { "source": "env", "id": "FIREWORKS_API_KEY" }
  }
}
```

### Key settings

| Setting | Description |
|---|---|
| `ownerUserId` | Your Slack user ID (Profile → `...` → Copy member ID) |
| `shadowChannels` | Slack channel IDs Robin watches passively (owner messages only) |
| `toolPolicy` | Tool allowlists per risk level. `high: []` means no tools for destructive requests |
| `synthesisCron` | Cron schedule for nightly pattern synthesis (default: `0 2 * * *`) |
| `synthesisBatchSize` | Recent activity records fed to synthesizer per run (default: 50) |
| `modelRouting.actionModel` | Fast model for well-defined tasks (kimi2.5) |
| `modelRouting.reviewerModel` | Analytical model for thinking tasks (glm5) |

---

## MCP servers

Robin auto-loads MCP servers from `~/.claude.json` (managed by Claude Code):

```
[robin] mcp: loaded 2 server(s) from ~/.claude.json: coralogix-mcp, github
```

Tokens stay in `~/.claude.json` — never copied into Robin's config or source.

For additional HTTP-based MCP servers, use the `mcp add` command at runtime.

---

## Model routing

Model is selected per-request based on signals from the message and thread context:

| Signal | Model | Provider |
|---|---|---|
| Todo updates, quick Q&A, low-risk | kimi-k2p5 | Fireworks |
| Analytical thinking (`explain why`, `think through`) | glm-5 | Fireworks |
| Read/search tools needed | claude-haiku | Anthropic |
| Coralogix, GitHub, k8s, alert keywords | claude-sonnet | Anthropic |
| `think deeply`, `use opus` | claude-opus | Anthropic |

**User override in prompt:** `use kimi: ...` / `use glm: ...` / `use opus: ...` / `use haiku: ...` / `use sonnet: ...`

Test routing decisions: `npx tsx scripts/test-routing.ts`
