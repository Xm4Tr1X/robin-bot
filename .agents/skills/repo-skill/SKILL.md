# Robin Bot Repo Skill

Personal AI assistant (TypeScript/Node 24) — 561 tests, production-ready.

## Load Policy

always-load:
  - core/boundaries.md
  - core/quick-ref.md

on-mention:
  - shadow: modules/technical/patterns.md
  - memory: modules/technical/patterns.md
  - ledger: modules/technical/patterns.md
  - safety: modules/technical/patterns.md
  - staging: modules/technical/patterns.md
  - routing: modules/technical/patterns.md
  - fireworks: modules/technical/patterns.md
  - kimi: modules/technical/patterns.md
  - thread: modules/technical/patterns.md
  - mcp: modules/technical/patterns.md

on-file-change:
  - src/shadow/: modules/technical/patterns.md
  - src/memory/: modules/technical/patterns.md
  - src/policy/: modules/technical/patterns.md
  - src/features/staging/: modules/technical/patterns.md
  - src/runtime/: modules/technical/patterns.md
  - src/display/: modules/technical/patterns.md
  - src/contracts.ts: core/boundaries.md
  - src/ingress/: modules/technical/patterns.md
