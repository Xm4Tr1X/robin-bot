/**
 * Access policy module for Robin.
 *
 * Implements OWNER-first access control as a pure function with no side
 * effects or I/O. All exported functions are fully testable in isolation.
 */

import type { AccessContext, AuditEvent, PolicyDecision } from '../contracts';

// ---------------------------------------------------------------------------
// checkAccess
// ---------------------------------------------------------------------------

/**
 * Evaluate the access policy for a given AccessContext and return a
 * PolicyDecision. Rules are evaluated in order; the first match wins.
 *
 * Evaluation order:
 *  1. Empty ownerUserId          → deny  "owner identity not configured"
 *  2. actor === owner            → allow (owner always trusted)
 *  3. source is 'cli' | 'system' → allow (local sources trusted)
 *  4. allowConversationsWithOthers=false → deny
 *  5. Slack DM + allowDmFromOthers=false → deny
 *  6. Slack mention + allowMentionsFromOthers=false → deny
 *  7. allowedUserIds non-empty + actor not in list → deny
 *  8. allowedChannelIds non-empty + channel not in list → deny
 *  9. → allow
 */
export function checkAccess(ctx: AccessContext): PolicyDecision {
  // Rule 1 — owner identity must be configured
  if (ctx.ownerUserId === '') {
    return deny('owner identity not configured');
  }

  // Rule 2 — owner is always allowed
  if (ctx.actorId === ctx.ownerUserId) {
    return allow();
  }

  // Rule 3 — local / trusted sources are always allowed
  if (ctx.source === 'cli' || ctx.source === 'system') {
    return allow();
  }

  // Rule 4 — conversations with non-owners may be globally disabled
  if (!ctx.allowConversationsWithOthers) {
    return deny('conversations with others are disabled');
  }

  // Rule 5 — Slack DM check (no channelId, or channelId starts with 'D')
  if (ctx.source === 'slack') {
    const isDm = !ctx.channelId || ctx.channelId.startsWith('D');
    if (isDm && !ctx.allowDmFromOthers) {
      return deny('DMs from non-owners are disabled');
    }
  }

  // Rule 6 — Slack mention check (channelId starts with 'C')
  if (ctx.source === 'slack') {
    const isMention = !!ctx.channelId && ctx.channelId.startsWith('C');
    if (isMention && !ctx.allowMentionsFromOthers) {
      return deny('mentions from non-owners are disabled');
    }
  }

  // Rule 7 — user allowlist (only active when list is non-empty)
  if (ctx.allowedUserIds.length > 0 && !ctx.allowedUserIds.includes(ctx.actorId)) {
    return deny('user not in allowlist');
  }

  // Rule 8 — channel allowlist (only active when list is non-empty)
  if (
    ctx.allowedChannelIds.length > 0 &&
    (!ctx.channelId || !ctx.allowedChannelIds.includes(ctx.channelId))
  ) {
    return deny('channel not in allowlist');
  }

  // Rule 9 — all gates passed
  return allow();
}

// ---------------------------------------------------------------------------
// buildDenialReply
// ---------------------------------------------------------------------------

/**
 * Build a Slack-safe denial message for a denied PolicyDecision.
 * Uses Slack mrkdwn italic formatting (underscore-wrapped).
 */
export function buildDenialReply(decision: PolicyDecision): string {
  const reason = decision.reason ?? 'access denied';
  return `_Sorry, I can't respond to that: ${reason}._`;
}

// ---------------------------------------------------------------------------
// buildAuditEvent
// ---------------------------------------------------------------------------

/**
 * Build an AuditEvent from an AccessContext and PolicyDecision.
 * The event_type is always "access.policy".
 */
export function buildAuditEvent(
  ctx: AccessContext,
  decision: PolicyDecision,
  correlationId: string,
): AuditEvent {
  const metadata: Record<string, unknown> = {
    source: ctx.source,
    channelId: ctx.channelId,
  };

  if (!decision.allow && decision.reason !== undefined) {
    metadata.reason = decision.reason;
  }

  return {
    event_type: 'access.policy',
    actor_id: ctx.actorId,
    timestamp: new Date().toISOString(),
    correlation_id: correlationId,
    outcome: decision.allow ? 'allowed' : 'denied',
    metadata,
  };
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function allow(): PolicyDecision {
  return { allow: true };
}

function deny(reason: string): PolicyDecision {
  return { allow: false, reason };
}
