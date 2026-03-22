# Robin — Development

---

## Running

```bash
npm run dev          # Slack + CLI in parallel; nodemon auto-reloads on src/ changes
npm run dev:sandbox  # Raw Claude chat — no pipeline, no tools
ROBIN_CLI=true npm run dev  # Force CLI only (skip Slack even if tokens are set)
npm start            # Compiled output (no auto-reload)
```

---

## Testing

```bash
npm test                  # All tests
npm run test:unit         # Unit tests only
npm run test:watch        # Watch mode
npm run test:coverage     # Coverage report
npx tsx scripts/test-llm.ts      # Live LLM tests (Fireworks + Claude + MCP registry)
npx tsx scripts/test-routing.ts  # Model routing table (instant, no API calls)
```

Tests use Vitest. No real Slack or LLM calls — adapters and runner are mocked.

**TDD is required:** write a failing test first, implement to pass, then refactor. See `AGENTS.md`.

---

## Project layout

```
src/
  audit/           Structured audit event emission
  core/            EventRouter, CommandRouter, AssistantService
  display/         ActivityBus + CLI renderer (spinner, tool calls, ingress badges)
  features/
    alerts/        Alert ingestion and triage
    comms/         Template-driven comms drafts
    mcp/           MCP connection lifecycle
    mentions/      Mention lifecycle tracking
    mode/          Assistant mode commands
    policy/        Runtime-mutable access policy
    staging/       Staged action approval (approve/reject)
    todos/         Todo ledger + natural language executor
    upgradePlanner Propose-only upgrade recommendations
  ingress/         Slack and CLI adapters
  mcp/             Claude Code MCP config loader (~/.claude.json)
  memory/          Memory CRUD, retrieval, writeback, global patterns
  policy/          Access control, safety gates, persona guard, redaction
  prompting/       Prompt envelope builder, persona registry
  runtime/         RunnerClient (Claude Agent SDK + Fireworks), model selector, factory
  sandbox/         Raw LLM chat — no pipeline
  shadow/          Slack shadow observation, pattern synthesizer, scheduler
  store/           DurableStore contract + SQLite + in-memory
  web/             Express dashboard (todos + settings API)
```

---

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full data flow diagram and component separation.

---

## Key conventions

- `src/contracts.ts` — single source of truth for all cross-module interfaces; never redefine types elsewhere
- Import convention: source files **no** `.js` extension; test files **yes** `.js` (Vitest resolves them)
- `ledgerHolder.instance.*` — always use this reference, not a direct import
- Safety gates fail closed — never silent pass-through on error
- Memory writeback only after post-check + persona guard pass

---

## Web dashboard

`http://127.0.0.1:4888` (or `ROBIN_WEB_PORT` / `settings.webPort`)

Shows active todos with source badges, settings editor. Polls every 30 seconds.

---

## Scripts

| Script | Purpose |
|---|---|
| `scripts/test-llm.ts` | Live tests: routing table, Fireworks calls, Claude calls, MCP registry |
| `scripts/test-routing.ts` | Model routing decisions (no API calls) |
| `scripts/add-todos.ts` | Seed todo ledger from CLI |
| `scripts/list-todos.ts` | List todos from CLI |
