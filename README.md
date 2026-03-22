# Robin

Personal AI assistant powered by Claude and open-source models. Reaches you through Slack and a local CLI simultaneously, with shared todo state, session memory, and structured access control.

---

## Docs

| Document | What it covers |
|---|---|
| [Architecture](docs/ARCHITECTURE.md) | System design, data flow, safety boundaries, MCP strategy |
| [Commands](docs/COMMANDS.md) | Full command reference for all features |
| [Configuration](docs/CONFIGURATION.md) | robin.json schema, environment variables, model routing |
| [Development](docs/DEVELOPMENT.md) | Running locally, testing, project layout |

---

## What Robin does

```
Slack / CLI / Web
      │
      ▼
  Ingress Adapters          normalize events → IngressEvent
      │
      ▼
  Access Policy             OWNER-first; deny non-owners by default
      │
      ▼
  Model Orchestrator        routes to Claude (Haiku/Sonnet/Opus) or Fireworks (kimi2.5/glm5)
      │
      ▼
  Command Router            deterministic commands matched first, no LLM needed
      │  └── unmatched
      ▼
  Assistant Service         prompt envelope → safety precheck → LLM runner
      │                     → safety postcheck → persona guard → reply
      ▼
  Reply (Slack / CLI)
```

**Key properties:**
- **OWNER-first** — the owner's messages always pass; everyone else is denied by default
- **Multi-model routing** — kimi2.5/glm5 for fast tasks, Claude Haiku/Sonnet/Opus for tools and investigation
- **MCP integration** — Coralogix, GitHub, and other servers loaded from `~/.claude.json` automatically
- **Slack shadow observation** — passively records owner activity in configured channels; nightly pattern synthesis
- **Thread-aware** — fetches thread context on @mention; continues in thread without re-mentioning
- **Live CLI display** — spinner, streaming tool calls, ingress badges, model label shown in real time
- **Safety gates** — secrets blocked before LLM; forbidden tools hard-blocked; persona guard post-LLM

---

## Quick start

```bash
npm install
```

Create `.env`:
```env
ANTHROPIC_API_KEY=sk-ant-...   # or configure Vertex — see docs/CONFIGURATION.md
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
FIREWORKS_API_KEY=fw_...
```

Create `robin.json` — see [Configuration](docs/CONFIGURATION.md).

```bash
npm run dev       # Slack + CLI in parallel, auto-reloads on src/ changes
npm run dev:sandbox  # raw Claude chat, no pipeline
npm test          # 561 tests
```

---

## Model routing

| Request type | Model | Provider |
|---|---|---|
| Todo updates, quick Q&A | kimi-k2p5 | Fireworks |
| Analytical thinking (no tools) | glm-5 | Fireworks |
| Read/search tools needed | claude-haiku | Anthropic |
| Alert investigation + MCP | claude-sonnet | Anthropic |
| Deep reasoning (`use opus`) | claude-opus | Anthropic |
| `show todos`, `mark done:` | none (deterministic) | — |

Override per-request: `use kimi: …` / `use opus: …` / `use glm: …`

Test routing: `npx tsx scripts/test-routing.ts`

---

## Safety

- Secrets (tokens, API keys) blocked before LLM sees them
- Forbidden tools (`Write`, `Edit`, `Bash`) hard-blocked from LLM tool list
- Persona guard blocks reasoning leaks and identity violations post-LLM
- MCP tokens come from `~/.claude.json` — never stored in Robin's config or source
