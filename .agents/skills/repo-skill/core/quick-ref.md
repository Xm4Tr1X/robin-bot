# Robin Bot — Quick Reference

## Run Commands

```bash
npm run dev           # Slack + CLI (nodemon auto-reloads on src/ changes)
npm run dev:sandbox   # sandbox: raw Claude, no pipeline
ROBIN_CLI=true npm run dev  # CLI only
npm start             # compiled, no reload
npm test              # all tests (561 passing, 41 files)
npm run test:unit     # unit tests only
npm run test:watch    # watch mode
npm run test:coverage # coverage report
npx tsx scripts/test-llm.ts      # live LLM capability tests
npx tsx scripts/test-routing.ts  # model routing table (instant)
npx tsc --noEmit      # typecheck only
```

## Import Convention

- Source files (`src/`): NO `.js` extension
- Test files (`tests/`): YES `.js` extension (Vitest resolves them)

## Config Files

- `robin.json` — runtime config (settings, features, options, modelRouting, secrets)
- `.env` — `ANTHROPIC_API_KEY`, `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, `FIREWORKS_API_KEY`
- `vitest.config.ts` — test config
- `src/config.ts` — `getConfigPath()`, `readRawConfig()`, `writeRawConfig()`

## Key robin.json Shape

```json
{
  "settings": {
    "ownerUserId": "UXXXXXXXX",
    "allowedTools": ["Read", "Glob", "Grep", "WebSearch", "WebFetch"],
    "dbPath": "./data/robin.db",
    "webPort": 4888,
    "shadowChannels": ["C012345ABC"],
    "toolPolicy": { "low": [...], "medium": [...], "high": [] }
  },
  "features": { "slackEnabled": true },
  "options": { "defaultMode": "reply", "synthesisCron": "0 2 * * *" },
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

## Model Routing Quick Reference

| Input signal | Model | Provider |
|---|---|---|
| `todo`, `mark`, `done`, `unblocked` | kimi-k2p5 | Fireworks |
| `explain why`, `think through`, `analyze` | glm-5 | Fireworks |
| `search`, `find`, `read` (file tools) | claude-haiku | Anthropic |
| `coralogix`, `alert`, `k8s`, `incident`, MCP keywords | claude-sonnet | Anthropic |
| `think deeply`, `use opus` | claude-opus | Anthropic |
| User override: `use kimi:` / `use glm:` / etc. | override applies | — |

Thread context is also scanned for routing signals — "check this" in a Coralogix alert thread routes to Sonnet.

## Store Usage Pattern

```ts
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
  metadata: { reason, source },
})
```

## ActivityBus Pattern (CLI display)

```ts
activityBus.emit({ kind: 'runner_start', displayName: 'kimi-k2p5 · fireworks' });
activityBus.emit({ kind: 'tool_call', tool: 'Read', toolInput: '...' });
activityBus.emit({ kind: 'completing', durationMs: 1400 });
```

No-op when no subscribers (Slack-only mode, tests).

## Adding a New Feature

1. Types: `src/features/{name}/{name}.types.ts`
2. Service: `src/features/{name}/{name}.service.ts`
3. Commands: `src/features/{name}/{name}.commands.ts`
4. Wire into `FeatureServices` in `command.router.ts`
5. Wire into `EventRouterConfig` in `event.router.ts`
6. Tests: `tests/unit/features/{name}/`
7. TDD: write failing test first — never write implementation before the test
