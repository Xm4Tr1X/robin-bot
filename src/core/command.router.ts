/**
 * Command router for Robin.
 *
 * Routes deterministic commands from normalized text before any LLM call.
 * All matching is done with regular expressions; the function is pure-ish
 * (it calls session/todo side-effect functions but is deterministic given state).
 *
 * Phase G feature commands are gated behind optional FeatureServices — if a
 * service is not provided the corresponding command group is skipped.
 */

import type { CommandResult } from '../contracts';
import type { Bucket, Priority } from '../types';
import { ledgerHolder } from '../todo';
import {
  getSessionSummary,
  resetSession,
  setMode,
  saveSnapshot,
  clearSnapshot,
} from '../session';

// Phase G feature service types (used only for typing; implementations injected at runtime)
import type { MentionService } from '../features/mentions/mention.service';
import type { TodoApprovalService } from '../features/todos/todo.approval';
import type { AlertService } from '../features/alerts/alert.service';
import type { MCPService } from '../features/mcp/mcp.service';
import type { CommsService } from '../features/comms/comms.service';
import type { UpgradePlannerService } from '../features/upgradePlanner/upgrade.service';
import type { PolicyService } from '../features/policy/policy.service';

// Phase G feature command routers (statically imported; tree-shaken when unused)
import { routeMentionCommand } from '../features/mentions/mention.commands';
import { routeTodoApprovalCommand } from '../features/todos/todo.commands';
import { routeAlertCommand } from '../features/alerts/alert.commands';
import { routeMcpCommand } from '../features/mcp/mcp.commands';
import { routeCommsCommand } from '../features/comms/comms.commands';
import { routeUpgradeCommand } from '../features/upgradePlanner/upgrade.commands';
import { routeAssistantModeCommand } from '../features/mode/mode.commands';
import { routePolicyCommand } from '../features/policy/policy.commands';

// ---------------------------------------------------------------------------
// Phase G feature services interface
// ---------------------------------------------------------------------------

/**
 * Optional Phase G feature services. Pass into routeCommand to enable the
 * corresponding command groups. Omit a service to skip that command group.
 */
export interface FeatureServices {
  mentionService?: MentionService;
  todoApprovalService?: TodoApprovalService;
  alertService?: AlertService;
  mcpService?: MCPService;
  commsService?: CommsService;
  upgradePlannerService?: UpgradePlannerService;
  policyService?: PolicyService;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Strip all <@USERID> Slack mention patterns from a string and trim whitespace.
 */
export function stripMention(text: string): string {
  return text.replace(/<@[A-Z0-9]+>/gi, '').trim();
}

/**
 * Split a conversationId of the form "channelId:threadId" into its parts.
 * If there is no colon the entire string is used as the channelId and the
 * threadId defaults to an empty string.
 */
function splitConversationId(conversationId: string): { channelId: string; threadId: string } {
  const idx = conversationId.indexOf(':');
  if (idx === -1) return { channelId: conversationId, threadId: '' };
  return {
    channelId: conversationId.slice(0, idx),
    threadId: conversationId.slice(idx + 1),
  };
}

// ---------------------------------------------------------------------------
// Bracket tag parsers (e.g. "[high]", "[long-term]")
// ---------------------------------------------------------------------------

function parsePriority(text: string): Priority {
  if (/\[high\]/i.test(text)) return 'high';
  if (/\[low\]/i.test(text)) return 'low';
  return 'medium';
}

function parseBucket(text: string): Bucket {
  if (/\[long-term\]/i.test(text)) return 'long-term';
  return 'short-term';
}

/**
 * Strip all bracket tags of the form [word] or [word-word] from a string
 * and trim the result. Used to clean the task name after tag extraction.
 */
function stripBracketTags(text: string): string {
  return text.replace(/\[[^\]]*\]/g, '').trim();
}

// ---------------------------------------------------------------------------
// routeCommand
// ---------------------------------------------------------------------------

/**
 * Attempt to match `text` against a set of deterministic command patterns.
 *
 * @param text           - The (already mention-stripped) user input.
 * @param conversationId - Conversation identifier in "channelId:threadId" form.
 * @param actorId        - Actor making the request (used by approval commands).
 * @param features       - Optional Phase G feature services.
 * @returns A CommandResult — either `{ handled: true, ... }` or `{ handled: false }`.
 */
export function routeCommand(
  text: string,
  conversationId: string,
  actorId: string = 'system',
  features?: FeatureServices,
): CommandResult {
  const { channelId, threadId } = splitConversationId(conversationId);

  // -------------------------------------------------------------------------
  // Session commands
  // -------------------------------------------------------------------------

  if (/^summarize context/i.test(text) || /^what are you tracking/i.test(text)) {
    const summary = getSessionSummary(channelId, threadId);
    return { handled: true, commandType: 'session', reply: summary };
  }

  if (/^reset session/i.test(text)) {
    resetSession(channelId, threadId);
    return {
      handled: true,
      commandType: 'session',
      reply: '_Session reset. Starting fresh._',
    };
  }

  // -------------------------------------------------------------------------
  // Snapshot commands
  // -------------------------------------------------------------------------

  if (/^save snapshot/i.test(text)) {
    saveSnapshot();
    return { handled: true, commandType: 'snapshot', reply: '_Snapshot saved._' };
  }

  if (/^discard snapshot/i.test(text)) {
    clearSnapshot();
    ledgerHolder.instance.clear();
    return {
      handled: true,
      commandType: 'snapshot',
      reply: '_Snapshot discarded. Starting fresh._',
    };
  }

  // -------------------------------------------------------------------------
  // Mode commands
  // -------------------------------------------------------------------------

  if (/\breply mode\b/i.test(text)) {
    setMode(channelId, threadId, 'reply');
    return { handled: true, commandType: 'mode', reply: '_Switched to reply mode._' };
  }

  if (/\bdraft mode\b/i.test(text)) {
    setMode(channelId, threadId, 'draft');
    return { handled: true, commandType: 'mode', reply: '_Switched to draft mode._' };
  }

  if (/\bobserve mode\b/i.test(text)) {
    setMode(channelId, threadId, 'observe');
    return { handled: true, commandType: 'mode', reply: '_Switched to observe mode._' };
  }

  // -------------------------------------------------------------------------
  // Phase H: Assistant mode (orchestrated / claude-direct / status)
  // These patterns are distinct from the response-mode commands above.
  // -------------------------------------------------------------------------

  const assistantModeResult = routeAssistantModeCommand(text, conversationId);
  if (assistantModeResult) return assistantModeResult;

  // -------------------------------------------------------------------------
  // Phase H: Policy command surface
  // -------------------------------------------------------------------------

  if (features?.policyService) {
    const result = routePolicyCommand(text, features.policyService);
    if (result) return result;
  }

  // -------------------------------------------------------------------------
  // Todo commands (core ledger — show / add / mark)
  // -------------------------------------------------------------------------

  if (/^(show todos?|list todos?|my todos?)/i.test(text)) {
    const list = ledgerHolder.instance.formatForSlack();
    return { handled: true, commandType: 'todo', reply: list };
  }

  const addMatch = /^add (?:todo|task):?\s+(.+)/i.exec(text);
  if (addMatch) {
    const rawTask = addMatch[1];
    const priority = parsePriority(rawTask);
    const bucket = parseBucket(rawTask);
    const taskName = stripBracketTags(rawTask);
    const item = ledgerHolder.instance.add({ task: taskName, priority, bucket, source: 'cli' });
    return {
      handled: true,
      commandType: 'todo',
      reply: `_Added:_ *${item.task}* [\`${item.id}\`] — ${item.priority} | ${item.bucket}`,
    };
  }

  const markDoneMatch = /^mark done:?\s+(\S+)/i.exec(text);
  if (markDoneMatch) {
    ledgerHolder.instance.update(markDoneMatch[1], { status: 'done' });
    return {
      handled: true,
      commandType: 'todo',
      reply: `_Marked done:_ \`${markDoneMatch[1]}\``,
    };
  }

  const markBlockedMatch = /^mark blocked:?\s+(\S+)/i.exec(text);
  if (markBlockedMatch) {
    ledgerHolder.instance.update(markBlockedMatch[1], { status: 'blocked' });
    return {
      handled: true,
      commandType: 'todo',
      reply: `_Marked blocked:_ \`${markBlockedMatch[1]}\``,
    };
  }

  const markInProgressMatch = /^mark in.?progress:?\s+(\S+)/i.exec(text);
  if (markInProgressMatch) {
    ledgerHolder.instance.update(markInProgressMatch[1], { status: 'in-progress' });
    return {
      handled: true,
      commandType: 'todo',
      reply: `_Marked in-progress:_ \`${markInProgressMatch[1]}\``,
    };
  }

  // -------------------------------------------------------------------------
  // Phase G: Mentions
  // -------------------------------------------------------------------------

  if (features?.mentionService) {
    const result = routeMentionCommand(text, features.mentionService);
    if (result) return result;
  }

  // -------------------------------------------------------------------------
  // Phase G: Todo approval (pending / approve / reject)
  // -------------------------------------------------------------------------

  if (features?.todoApprovalService) {
    const result = routeTodoApprovalCommand(text, features.todoApprovalService, actorId);
    if (result) return result;
  }

  // -------------------------------------------------------------------------
  // Phase G: Alerts
  // -------------------------------------------------------------------------

  if (features?.alertService) {
    const result = routeAlertCommand(text, features.alertService);
    if (result) return result;
  }

  // -------------------------------------------------------------------------
  // Phase G: MCP
  // -------------------------------------------------------------------------

  if (features?.mcpService) {
    const result = routeMcpCommand(text, features.mcpService);
    if (result) return result;
  }

  // -------------------------------------------------------------------------
  // Phase G: Comms
  // -------------------------------------------------------------------------

  if (features?.commsService) {
    const result = routeCommsCommand(text, features.commsService);
    if (result) return result;
  }

  // -------------------------------------------------------------------------
  // Phase G: Upgrade Planner
  // -------------------------------------------------------------------------

  if (features?.upgradePlannerService) {
    const result = routeUpgradeCommand(text, features.upgradePlannerService);
    if (result) return result;
  }

  // -------------------------------------------------------------------------
  // No match
  // -------------------------------------------------------------------------

  return { handled: false };
}
