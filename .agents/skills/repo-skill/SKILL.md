# Robin Bot Repo Skill

Personal AI assistant bot (TypeScript/Node 24) — Phases A–I complete, Phases J–K–L in progress.

## Load Policy

always-load:
  - core/boundaries.md
  - core/quick-ref.md

on-mention:
  - shadow: modules/technical/patterns.md
  - memory: modules/technical/patterns.md
  - ledger: modules/technical/patterns.md
  - safety: modules/technical/patterns.md
  - staging: plans/phases-jkl.md
  - phase-j: plans/phases-jkl.md
  - phase-k: plans/phases-jkl.md
  - phase-l: plans/phases-jkl.md

on-file-change:
  - src/shadow/: plans/phases-jkl.md
  - src/memory/: modules/technical/patterns.md
  - src/policy/: modules/technical/patterns.md
  - src/features/staging/: plans/phases-jkl.md
  - src/contracts.ts: core/boundaries.md
