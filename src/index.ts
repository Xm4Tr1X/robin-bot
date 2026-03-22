/**
 * Robin entrypoint.
 *
 * Starts all enabled ingress adapters in parallel (Slack + CLI are not mutually exclusive).
 * Events flow: adapter → EventRouter → AccessPolicy → CommandRouter → AssistantService
 */
import fs from 'fs';
import path from 'path';
import { getConfig } from './config';
import { loadSnapshot, saveSnapshot } from './session';
import { EventRouter, type AssistantService as AssistantServiceContract } from './core/event.router';
import { AssistantService } from './core/assistant.service';
import { AgentSdkRunnerClient } from './runtime/runner.client';
import { MemoryService } from './memory/memory.service';
import { SqliteStore } from './store/sqlite.store';
import { initTodoLedger } from './todo';
import type { DurableStore } from './store/store.contract';

const config = getConfig();

// Module-level references so SIGINT can close them cleanly.
let activeStore: DurableStore | null = null;
let activeHttpServer: { close(): void } | null = null;

process.on('SIGINT', () => {
  saveSnapshot('Auto-saved on shutdown');
  activeStore?.close();
  activeHttpServer?.close();
  console.log('\nrobin shutting down — snapshot saved.');
  process.exit(0);
});

async function bootstrap(): Promise<void> {
  // Ensure data directory exists before opening SQLite
  const dbPath = path.resolve(config.settings.dbPath);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  console.log(`[robin] store: ${dbPath}`);

  // node:sqlite is experimental in Node 22/23, stable in Node 24+.
  // The ExperimentalWarning is harmless — suppress it to keep startup clean.
  process.removeAllListeners('warning');
  const store = new SqliteStore(dbPath);
  activeStore = store;
  initTodoLedger(store);
  const memoryService = new MemoryService(store);

  // Schedule daily retention pruner — runs at 03:00 every day
  const cron = (await import('node-cron')).default;
  cron.schedule('0 3 * * *', () => {
    const pruned = memoryService.prune();
    if (pruned > 0) console.log(`[robin] retention: pruned ${pruned} expired memory entries`);
  });

  const runnerClient = new AgentSdkRunnerClient();

  const assistantService = new AssistantService({
    allowedTools: config.settings.allowedTools,
    memoryService,
    runnerClient,
    modelRouting: config.modelRouting.enabled ? config.modelRouting : null,
    fireworksApiKey: config.secrets.fireworksApiKey || process.env.FIREWORKS_API_KEY,
  });

  // Adapt AssistantService (returns AssistantResponse) to EventRouter's contract (returns string)
  const assistantAdapter: AssistantServiceContract = {
    handle: async (event, _sessionMode) => {
      const response = await assistantService.handle(event);
      return response.text;
    },
  };

  const baseRouterConfig = {
    ownerUserId: config.settings.ownerUserId,
    allowConversationsWithOthers: false,
    allowDmFromOthers: false,
    allowMentionsFromOthers: false,
    allowedUserIds: [] as string[],
    allowedChannelIds: [] as string[],
    assistantService: assistantAdapter,
  };

  // Slack: full assistant access — owner can ask anything including LLM/MCP investigation
  const slackEventRouter = new EventRouter({ ...baseRouterConfig });

  // CLI: full assistant access
  const cliEventRouter = new EventRouter({ ...baseRouterConfig });

  const adapters: Array<Promise<void>> = [];

  // Restore snapshot on startup
  const snapshot = loadSnapshot();

  // --- Slack adapter ---
  const hasSlack =
    config.features.slackEnabled &&
    !!config.secrets.slackBotToken &&
    !!config.secrets.slackAppToken;

  if (hasSlack) {
    adapters.push(startSlack(slackEventRouter, snapshot));
  }

  // --- CLI adapter --- always starts
  adapters.push(startCli(cliEventRouter, snapshot));

  // --- Web dashboard ---
  const { createWebServer } = await import('./web/server');
  activeHttpServer = createWebServer(store);
  console.log(`[robin] web: http://127.0.0.1:${config.settings.webPort}`);

  await Promise.all(adapters);
}

async function startSlack(
  eventRouter: EventRouter,
  snapshot: ReturnType<typeof loadSnapshot>
): Promise<void> {
  const { SlackAdapter } = await import('./ingress/slack.adapter');
  const cron = (await import('node-cron')).default;

  const adapter = new SlackAdapter({
    token: config.secrets.slackBotToken,
    appToken: config.secrets.slackAppToken,
    ownerUserId: config.settings.ownerUserId,
  });

  await adapter.start(async (event) => {
    await eventRouter.route(event, async (text) => {
      await adapter.reply(text, event.threadId, event.channelId!);
    });
  });

  console.log('robin is running (Slack / Socket Mode)');

  // Proactive check-ins
  if (config.features.checkInsEnabled) {
    const channel = config.settings.checkinChannel || config.settings.ownerUserId;
    if (channel) {
      cron.schedule('0 6 * * 1-5', () => adapter.postMessage(channel, morningCheckin()));
      cron.schedule('0 12 * * 1-5', () => adapter.postMessage(channel, eveningCheckin()));
    }
  }

  // Notify owner of restored snapshot
  if (snapshot && config.settings.ownerUserId) {
    const ts = new Date(snapshot.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const msg =
      `_Restored prior context from ${ts}._\n` +
      (snapshot.sessionSummary ? `Summary: ${snapshot.sessionSummary}\n` : '') +
      `\n_Say "yes continue" to keep this context, or "discard snapshot" to start fresh._`;
    try {
      await adapter.postMessage(config.settings.ownerUserId, msg);
    } catch (err) {
      console.error('[robin] Failed to send restoration prompt:', err);
    }
  }
}

async function startCli(
  eventRouter: EventRouter,
  snapshot: ReturnType<typeof loadSnapshot>
): Promise<void> {
  const { CliAdapter } = await import('./ingress/cli.adapter');
  const { startCliRenderer, notifyRunnerStart } = await import('./display/cli.renderer');

  // Wire the live display — must happen before adapter starts
  startCliRenderer();

  const adapter = new CliAdapter({ actorId: config.settings.ownerUserId || 'owner' });

  if (snapshot) {
    const ts = new Date(snapshot.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    console.log(`robin: Restored prior context from ${ts}.`);
    if (snapshot.sessionSummary) console.log(`       Summary: ${snapshot.sessionSummary}`);
    console.log('       Say "yes continue" to keep, or "discard snapshot" to start fresh.\n');
  }

  console.log('robin is running (CLI mode)');
  console.log('Type a message and press Enter. Ctrl+C to quit.\n');

  // CLI is a trusted local source — default to reply mode so the LLM responds fully.
  // Slack defaults to observe to avoid noise; CLI is interactive so reply is always expected.
  const { setMode } = await import('./session');
  setMode('cli', 'local', 'reply');

  await adapter.start(async (event) => {
    await eventRouter.route(event, async (text) => {
      // Print reply below the tool trace
      console.log(`\nrobin: ${text}\n`);
    });
  });
}

function morningCheckin(): string {
  return `*Morning check-in* (IST 11:30)\n\n_What are you working on today?_`;
}

function eveningCheckin(): string {
  return `*End-of-day check-in* (IST 17:30)\n\n_Anything to update before wrapping up?_`;
}

bootstrap().catch((err) => {
  console.error('[robin] Fatal startup error:', err);
  process.exit(1);
});
