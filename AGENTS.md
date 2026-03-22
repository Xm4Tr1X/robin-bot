# Robin Bot — Agent Orientation

## What This Is

Personal AI assistant (TypeScript/Node 24, Claude Agent SDK) reachable over Slack Socket Mode and local CLI simultaneously. Single owner, single tenant, local machine deployment. Phases A–I complete (443 tests). Phases J–K–L in progress.

## Repo Skill

Load `.agents/skills/repo-skill/` for deep context:
- `core/boundaries.md` — module boundaries, invariants, entry points (always load)
- `core/quick-ref.md` — run commands, import conventions, patterns (always load)
- `modules/technical/patterns.md` — non-obvious patterns: ledgerHolder, session modes, safety gates
- `plans/phases-jkl.md` — active implementation plan for shadow observation, pattern learning, approval gate

## Development Workflow

**All code changes must follow TDD (Test-Driven Development):**
1. Write the failing test first — verify it fails (RED)
2. Implement the minimum code to make it pass (GREEN)
3. Refactor if needed, keeping tests green
4. Never write implementation before the test exists

Use `npm run test:unit` after each step. New features without tests will be rejected.

For routing/model changes, also run `npx tsx scripts/test-routing.ts` to verify routing decisions.

## Key Invariants (never violate)

- `src/contracts.ts` is the single source of truth — never redefine types elsewhere
- Safety gates fail closed — never silent pass-through on error
- Memory writeback only after post-check + persona guard pass
- Import convention: source files no `.js`; test files yes `.js`
- Use `ledgerHolder.instance.*` not a direct ledger import

## Module Map

```
src/contracts.ts       # All cross-module interfaces
src/ingress/           # Slack + CLI adapters (emit IngressEvent only)
src/core/              # EventRouter → CommandRouter → AssistantService
src/policy/            # Access control, safety gates, redaction, persona guard
src/prompting/         # PromptEnvelope builder, persona registry
src/memory/            # Memory CRUD + retrieval + writeback
src/runtime/           # Claude Agent SDK wrapper
src/store/             # DurableStore contract + SQLite + in-memory
src/features/          # Feature pipelines (todos, mentions, alerts, comms, mcp, mode, policy, staging)
src/shadow/            # Phase J–K: activity recording + pattern synthesis
src/audit/             # Structured audit events to stderr
src/web/               # Express dashboard (port 3000)
src/sandbox/           # Raw LLM chat — no pipeline, no tools
```

## Test Setup

- Framework: Vitest v2.1+
- `npm test` — all tests | `npm run test:unit` — unit only | `npm run test:watch` — watch
- Test dir: `tests/unit/{module}/` and `tests/integration/`
- No real Slack or LLM calls in tests — all mocked

## Skills Index

| Skill | Trigger |
|---|---|
| `backend-engineer:plan` | Planning new features or phases; use when scoping work for J/K/L tasks |
| `backend-engineer:work` | TDD red-green loop; use when implementing any task from phases-jkl.md |
| `backend-engineer:review` | Reviewing changes before considering a task done |
| `backend-engineer:logs` | Investigating runtime issues from audit stderr output |
| `backend-engineer:brainstorm` | Exploring approaches before committing to implementation |
| `claude-md-management:revise-claude-md` | Updating CLAUDE.md with session learnings |

## Active Plan

Phases J–K–L: see `.agents/skills/repo-skill/plans/phases-jkl.md`

Current task order: J1 → J2 → J3 → J4 → J5 → K1 → K2 → K3 → K4 → K5 → L1 → L2 → L3 → L4 → L5

Start each task with `be:work` and the task ID (e.g. `be:work J1`).
