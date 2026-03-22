# Robin Bot — Agent Orientation

## What This Is

Personal AI assistant (TypeScript/Node 24, Claude Agent SDK + Fireworks AI) reachable over Slack Socket Mode, local CLI, and web dashboard. Single owner, single tenant, local machine. 561 tests across 41 files.

## Repo Skill

Load `.agents/skills/repo-skill/` for deep context:
- `core/boundaries.md` — module map, invariants, entry points (always load)
- `core/quick-ref.md` — run commands, model routing, store/audit/activity bus patterns (always load)
- `modules/technical/patterns.md` — non-obvious patterns: multi-model routing, thread context, ledgerHolder, safety gates, memory scopes, todo executor

## Key Invariants (never violate)

- `src/contracts.ts` is the single source of truth — never redefine types elsewhere
- Safety gates fail closed — never silent pass-through on error
- Memory writeback only after post-check + persona guard pass
- Import convention: source files no `.js`; test files yes `.js`
- `ledgerHolder.instance.*` — not a direct ledger import

## Development Workflow

**TDD is required:** write failing test first → implement → green → refactor. See `docs/DEVELOPMENT.md`.

Run tests after every change: `npm run test:unit`

## Module Map

```
src/contracts.ts         # All cross-module interfaces
src/ingress/             # Slack (shadow + active + thread) + CLI adapters
src/core/                # EventRouter → CommandRouter → AssistantService
src/display/             # ActivityBus + CLI renderer
src/policy/              # Access control, safety gates, redaction, persona guard, risk classifier
src/prompting/           # PromptEnvelope builder, persona registry, prompt contract
src/memory/              # Conversation + global memory CRUD + retrieval + writeback
src/runtime/             # RunnerClient (Claude Agent SDK + Fireworks), model selector, factory
src/shadow/              # Activity recording, thread fetcher, pattern synthesizer, scheduler
src/mcp/                 # ~/.claude.json MCP config loader
src/store/               # DurableStore contract + SQLite + in-memory
src/features/            # todos (executor), mentions, alerts, comms, mcp, mode, policy, staging
src/audit/               # Structured audit events to stderr
src/web/                 # Express dashboard (port 4888)
src/sandbox/             # Raw LLM chat — no pipeline, no tools
```

## Docs

- [Architecture](docs/ARCHITECTURE.md) — data flow, component responsibilities, security model
- [Commands](docs/COMMANDS.md) — full command reference
- [Configuration](docs/CONFIGURATION.md) — robin.json schema, env vars, model routing table
- [Development](docs/DEVELOPMENT.md) — running locally, testing, project layout

## Skills Index

| Skill | Trigger |
|---|---|
| `backend-engineer:plan` | Planning new features; use when scoping work |
| `backend-engineer:work` | TDD red-green loop; use when implementing |
| `backend-engineer:review` | Reviewing changes before considering done |
| `backend-engineer:logs` | Investigating runtime issues from audit stderr |
| `backend-engineer:brainstorm` | Exploring approaches before implementation |
| `claude-md-management:revise-claude-md` | Updating CLAUDE.md with session learnings |
