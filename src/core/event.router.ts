/**
 * Event router for Robin.
 *
 * Thin orchestrator that wires together:
 *   1. Access policy check
 *   2. Deterministic command routing
 *   3. LLM assistant service (fallback)
 *
 * Phase H: accepts an optional PolicyService for runtime-mutable access policy.
 */

import { randomUUID } from 'node:crypto';
import type { AccessContext, IngressEvent } from '../contracts';
import { checkAccess, buildDenialReply } from '../policy/access.policy';
import { routeCommand, stripMention } from './command.router';
import type { FeatureServices } from './command.router';
import { getSession } from '../session';
import type { PolicyService } from '../features/policy/policy.service';
import { auditService } from '../audit/audit.service';
import type { ActivityService } from '../shadow/activity.service';
import { activityBus } from '../display/activity.bus';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface AssistantService {
  handle(event: IngressEvent, sessionMode: string): Promise<string>;
}

export interface EventRouterConfig {
  ownerUserId: string;
  allowConversationsWithOthers: boolean;
  allowDmFromOthers: boolean;
  allowMentionsFromOthers: boolean;
  allowedUserIds: string[];
  allowedChannelIds: string[];
  assistantService: AssistantService;
  features?: FeatureServices;
  /**
   * Optional runtime-mutable policy. When provided, its current state is used
   * for access checks on every request (overrides the static config fields above).
   */
  policyService?: PolicyService;
  /**
   * When true, only deterministic task commands are handled. Free-form messages
   * that would fall through to the LLM are rejected with a fixed reply instead.
   * Use this for Slack where Robin should only manage tasks, not chat.
   */
  taskOnly?: boolean;
  /**
   * When provided, shadow events (source === 'slack_shadow') are recorded here
   * silently without going through the policy or command routing pipeline.
   */
  activityService?: ActivityService;
}

// ---------------------------------------------------------------------------
// EventRouter
// ---------------------------------------------------------------------------

export class EventRouter {
  private readonly config: EventRouterConfig;

  constructor(config: EventRouterConfig) {
    this.config = config;
  }

  /**
   * Route an ingress event through policy → command router → assistant.
   *
   * @param event - The normalized ingress event.
   * @param reply - A callback that sends a text reply back to the user.
   */
  async route(event: IngressEvent, reply: (text: string) => Promise<void>): Promise<void> {
    const cfg = this.config;
    const correlationId = randomUUID();

    // -----------------------------------------------------------------------
    // Step 0: Shadow observation — bypass all policy and command routing
    // -----------------------------------------------------------------------

    if (event.source === 'slack_shadow') {
      activityBus.emit({
        kind: 'shadow',
        source: 'slack_shadow',
        channel: event.channelId,
        text: event.text,
      });
      if (cfg.activityService) {
        cfg.activityService.record({
          channelId: event.channelId ?? '',
          actorId: event.actorId,
          text: event.text,
          ts: event.ts,
          threadTs: event.threadId ?? (event.metadata?.threadTs as string | undefined),
        });
      }
      return;
    }

    // Emit ingress event for active (non-shadow) sources
    activityBus.emit({
      kind: 'ingress',
      source: event.source,
      channel: event.channelId,
      text: event.text,
    });

    // -----------------------------------------------------------------------
    // Step 1: Build access context — prefer live PolicyService if present
    // -----------------------------------------------------------------------

    const policy = cfg.policyService?.get() ?? {
      ownerUserId: cfg.ownerUserId,
      allowConversationsWithOthers: cfg.allowConversationsWithOthers,
      allowDmFromOthers: cfg.allowDmFromOthers,
      allowMentionsFromOthers: cfg.allowMentionsFromOthers,
      allowedUserIds: cfg.allowedUserIds,
      allowedChannelIds: cfg.allowedChannelIds,
    };

    const accessCtx: AccessContext = {
      actorId: event.actorId,
      source: event.source,
      channelId: event.channelId,
      conversationId: event.conversationId,
      ...policy,
    };

    const decision = checkAccess(accessCtx);

    if (!decision.allow) {
      const denialMessage = buildDenialReply(decision);
      auditService.emit({
        event_type: 'access.denied',
        actor_id: event.actorId,
        correlation_id: correlationId,
        outcome: 'denied',
        metadata: {
          reason: decision.reason,
          source: event.source,
          conversationId: event.conversationId,
        },
      });
      await reply(denialMessage);
      return;
    }

    // -----------------------------------------------------------------------
    // Step 2: Strip mention, attempt deterministic command routing
    // -----------------------------------------------------------------------

    const strippedText = stripMention(event.text);
    const commandResult = routeCommand(
      strippedText,
      event.conversationId,
      event.actorId,
      cfg.features,
    );

    if (commandResult.handled) {
      await reply(commandResult.reply ?? '');
      return;
    }

    // -----------------------------------------------------------------------
    // Step 3: Resolve session mode and fall through to assistant
    // -----------------------------------------------------------------------

    // In task-only mode (Slack) free-form messages are not handled by the LLM.
    if (cfg.taskOnly) {
      await reply(
        '_I only handle task commands on Slack. Try: `show todos`, `add task: …`, `mark done: <id>`_',
      );
      return;
    }

    const sessionMode = this.resolveSessionMode(event.conversationId);
    const response = await cfg.assistantService.handle(event, sessionMode);
    await reply(response);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Look up the session for the given conversationId and return its mode.
   * conversationId is expected to be "channelId:threadId".
   */
  private resolveSessionMode(conversationId: string): string {
    const idx = conversationId.indexOf(':');
    const channelId = idx === -1 ? conversationId : conversationId.slice(0, idx);
    const threadId = idx === -1 ? '' : conversationId.slice(idx + 1);
    const session = getSession(channelId, threadId);
    return session.mode;
  }
}
