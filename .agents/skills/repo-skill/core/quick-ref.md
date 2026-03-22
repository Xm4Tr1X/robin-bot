# Robin Bot — Quick Reference

## Run Commands

```bash
npm run dev           # full bot: Slack + CLI in parallel
ROBIN_CLI=true npm run dev  # force CLI only
npm run dev:sandbox   # sandbox: raw Claude, no pipeline
npm run web           # open web dashboard at localhost:3000
npm test              # all tests (443 passing across 31 files)
npm run test:unit     # unit tests only
npm run test:sandbox  # sandbox tests only
npm run test:coverage # coverage report
npm run test:watch    # watch mode
npx tsc --noEmit      # typecheck only
```

## Import Convention

- Source files (`src/`): NO `.js` extension on imports
- Test files (`tests/`): YES `.js` extension on imports (Vitest resolves them)

## Config Files

- `robin.json` — runtime config (settings, features, options, secrets)
- `.env` — `ANTHROPIC_API_KEY`, `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`
- `vitest.config.ts` — test config
- `src/config.ts` — `getConfigPath()`, `readRawConfig()`, `writeRawConfig()`

## Key robin.json Shape

```json
{
  "settings": {
    "ownerUserId": "UXXXXXXXX",
    "allowedTools": ["Read", "Glob", "Grep", "WebSearch", "WebFetch"],
    "dbPath": "./data/robin.db",
    "webPort": 3000,
    "shadowChannels": [],
    "toolPolicy": { "low": [...], "medium": [...], "high": [] }
  },
  "features": { "slackEnabled": true, "checkInsEnabled": false },
  "options": { "defaultMode": "observe", "synthesisCron": "0 2 * * *" },
  "secrets": {
    "slackBotToken": { "source": "env", "id": "SLACK_BOT_TOKEN" },
    "slackAppToken": { "source": "env", "id": "SLACK_APP_TOKEN" }
  }
}
```

## Test File Locations

```
tests/unit/{module}/   — unit tests
tests/integration/     — integration tests (policy flow, command flow, etc.)
tests/unit/web/        — web dashboard tests (supertest)
```

## Adding a New Feature

1. Define types in `src/features/{name}/{name}.types.ts`
2. Implement service in `src/features/{name}/{name}.service.ts`
3. Add command router in `src/features/{name}/{name}.commands.ts`
4. Inject service into `FeatureServices` in `src/core/command.router.ts`
5. Wire into `EventRouterConfig` in `src/core/event.router.ts`
6. Add tests in `tests/unit/features/{name}/`

## Store Usage Pattern

```ts
// Always use DurableStore contract — never import sqlite.store directly
store.upsert(TABLE, record)
store.get<T>(TABLE, id)
store.list<T>(TABLE, { where: { status: 'open' } })
store.delete(TABLE, id)
store.deleteWhere(TABLE, { conversationId })
```

## Audit Event Pattern

```ts
auditService.emit({
  event_type: 'access.denied',
  actor_id: event.actorId,
  correlation_id: correlationId,
  outcome: 'denied',
  metadata: { reason, source, conversationId },
})
```
Never log secrets or full prompt bodies in audit metadata.
