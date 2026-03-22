import { describe, it, expect } from 'vitest';
import type { AccessContext, PolicyDecision } from '../../../src/contracts.js';
import {
  checkAccess,
  buildDenialReply,
  buildAuditEvent,
} from '../../../src/policy/access.policy.js';

// ---------------------------------------------------------------------------
// Test helper — merges with a fully-permissive base context so individual
// tests only need to specify the fields they care about.
// ---------------------------------------------------------------------------

const BASE_CTX: AccessContext = {
  actorId: 'U_OTHER',
  source: 'slack',
  channelId: 'C_GENERAL',
  conversationId: 'C_GENERAL:1700000000.000001',
  ownerUserId: 'U_OWNER',
  allowConversationsWithOthers: true,
  allowDmFromOthers: true,
  allowMentionsFromOthers: true,
  allowedUserIds: [],
  allowedChannelIds: [],
};

function makeCtx(overrides: Partial<AccessContext> = {}): AccessContext {
  return { ...BASE_CTX, ...overrides };
}

// ---------------------------------------------------------------------------
// checkAccess — branch coverage
// ---------------------------------------------------------------------------

describe('checkAccess', () => {
  // Rule 1: empty ownerUserId → always deny
  it('denies when ownerUserId is empty string', () => {
    const decision = checkAccess(makeCtx({ ownerUserId: '' }));
    expect(decision.allow).toBe(false);
    expect(decision.reason).toBe('owner identity not configured');
  });

  // Rule 2: actor IS the owner → always allow
  it('allows the owner regardless of other flags', () => {
    const decision = checkAccess(
      makeCtx({
        actorId: 'U_OWNER',
        allowConversationsWithOthers: false,
        allowDmFromOthers: false,
        allowMentionsFromOthers: false,
        allowedUserIds: ['U_SOMEONE_ELSE'],
      }),
    );
    expect(decision.allow).toBe(true);
  });

  // Rule 3a: cli source → always allow (even when conversations disabled)
  it('allows cli source even when allowConversationsWithOthers is false', () => {
    const decision = checkAccess(
      makeCtx({
        source: 'cli',
        allowConversationsWithOthers: false,
      }),
    );
    expect(decision.allow).toBe(true);
  });

  // Rule 3b: system source → always allow
  it('allows system source even when allowConversationsWithOthers is false', () => {
    const decision = checkAccess(
      makeCtx({
        source: 'system',
        allowConversationsWithOthers: false,
      }),
    );
    expect(decision.allow).toBe(true);
  });

  // Rule 4: non-owner, allowConversationsWithOthers=false → deny
  it('denies non-owner when allowConversationsWithOthers is false', () => {
    const decision = checkAccess(makeCtx({ allowConversationsWithOthers: false }));
    expect(decision.allow).toBe(false);
    expect(decision.reason).toBe('conversations with others are disabled');
  });

  // Rule 5a: non-owner, Slack DM (no channelId), allowDmFromOthers=false → deny
  it('denies non-owner DM (no channelId) when allowDmFromOthers is false', () => {
    const decision = checkAccess(
      makeCtx({
        channelId: undefined,
        allowDmFromOthers: false,
      }),
    );
    expect(decision.allow).toBe(false);
    expect(decision.reason).toBe('DMs from non-owners are disabled');
  });

  // Rule 5b: non-owner, Slack DM (channelId starts with 'D'), allowDmFromOthers=false → deny
  it('denies non-owner Slack DM (D-prefixed channelId) when allowDmFromOthers is false', () => {
    const decision = checkAccess(
      makeCtx({
        channelId: 'D_DM_CHANNEL',
        allowDmFromOthers: false,
      }),
    );
    expect(decision.allow).toBe(false);
    expect(decision.reason).toBe('DMs from non-owners are disabled');
  });

  // Rule 6: non-owner, Slack mention (channelId starts with 'C'), allowMentionsFromOthers=false → deny
  it('denies non-owner Slack mention when allowMentionsFromOthers is false', () => {
    const decision = checkAccess(
      makeCtx({
        channelId: 'C_GENERAL',
        allowMentionsFromOthers: false,
      }),
    );
    expect(decision.allow).toBe(false);
    expect(decision.reason).toBe('mentions from non-owners are disabled');
  });

  // Rule 7a: allowedUserIds non-empty and actor IS in the list → allow
  it('allows non-owner who is in allowedUserIds', () => {
    const decision = checkAccess(makeCtx({ allowedUserIds: ['U_OTHER', 'U_FRIEND'] }));
    expect(decision.allow).toBe(true);
  });

  // Rule 7b: allowedUserIds non-empty and actor is NOT in the list → deny
  it('denies non-owner who is not in allowedUserIds', () => {
    const decision = checkAccess(makeCtx({ allowedUserIds: ['U_FRIEND'] }));
    expect(decision.allow).toBe(false);
    expect(decision.reason).toBe('user not in allowlist');
  });

  // Rule 7c: allowedUserIds empty → no restriction applies
  it('allows any non-owner when allowedUserIds is empty and all flags are enabled', () => {
    const decision = checkAccess(makeCtx({ allowedUserIds: [] }));
    expect(decision.allow).toBe(true);
  });

  // Rule 8a: allowedChannelIds non-empty and channel IS in the list → allow
  it('allows when channelId is in allowedChannelIds', () => {
    const decision = checkAccess(
      makeCtx({
        channelId: 'C_ALLOWED',
        allowedChannelIds: ['C_ALLOWED', 'C_OTHER'],
      }),
    );
    expect(decision.allow).toBe(true);
  });

  // Rule 8b: allowedChannelIds non-empty and channel NOT in the list → deny
  it('denies when channelId is not in allowedChannelIds', () => {
    const decision = checkAccess(
      makeCtx({
        channelId: 'C_GENERAL',
        allowedChannelIds: ['C_ALLOWED'],
      }),
    );
    expect(decision.allow).toBe(false);
    expect(decision.reason).toBe('channel not in allowlist');
  });

  // Rule 8c: allowedChannelIds non-empty but channelId is undefined → deny (not in list)
  it('denies when allowedChannelIds is set but channelId is undefined', () => {
    const decision = checkAccess(
      makeCtx({
        channelId: undefined,
        allowedChannelIds: ['C_ALLOWED'],
      }),
    );
    expect(decision.allow).toBe(false);
    expect(decision.reason).toBe('channel not in allowlist');
  });

  // Rule 9: all gates pass → allow
  it('allows non-owner when all flags permissive and no allowlists set', () => {
    const decision = checkAccess(makeCtx());
    expect(decision.allow).toBe(true);
    expect(decision.reason).toBeUndefined();
  });

  // Rule ordering: owner bypass happens before conversations check
  it('owner is allowed even when allowedUserIds excludes them', () => {
    const decision = checkAccess(
      makeCtx({
        actorId: 'U_OWNER',
        allowedUserIds: ['U_FRIEND'],
      }),
    );
    expect(decision.allow).toBe(true);
  });

  // Rule ordering: cli bypass happens before DM/mention checks
  it('cli source allowed even when allowDmFromOthers and allowMentionsFromOthers are false', () => {
    const decision = checkAccess(
      makeCtx({
        source: 'cli',
        allowDmFromOthers: false,
        allowMentionsFromOthers: false,
        channelId: 'D_DM',
      }),
    );
    expect(decision.allow).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildDenialReply
// ---------------------------------------------------------------------------

describe('buildDenialReply', () => {
  it('returns a non-empty string for a denied decision with reason', () => {
    const denied: PolicyDecision = { allow: false, reason: 'conversations with others are disabled' };
    const reply = buildDenialReply(denied);
    expect(typeof reply).toBe('string');
    expect(reply.length).toBeGreaterThan(0);
  });

  it('returns a non-empty string for a denied decision without reason', () => {
    const denied: PolicyDecision = { allow: false };
    const reply = buildDenialReply(denied);
    expect(typeof reply).toBe('string');
    expect(reply.length).toBeGreaterThan(0);
  });

  it('reply is Slack-safe italic (wrapped in underscores)', () => {
    const denied: PolicyDecision = { allow: false, reason: 'user not in allowlist' };
    const reply = buildDenialReply(denied);
    expect(reply.startsWith('_')).toBe(true);
    expect(reply.endsWith('_')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildAuditEvent
// ---------------------------------------------------------------------------

describe('buildAuditEvent', () => {
  const ctx = makeCtx();
  const correlationId = 'corr-abc-123';

  it('sets event_type to "access.policy"', () => {
    const allowed: PolicyDecision = { allow: true };
    const event = buildAuditEvent(ctx, allowed, correlationId);
    expect(event.event_type).toBe('access.policy');
  });

  it('sets actor_id from ctx.actorId', () => {
    const allowed: PolicyDecision = { allow: true };
    const event = buildAuditEvent(ctx, allowed, correlationId);
    expect(event.actor_id).toBe(ctx.actorId);
  });

  it('sets outcome to "allowed" when decision.allow is true', () => {
    const allowed: PolicyDecision = { allow: true };
    const event = buildAuditEvent(ctx, allowed, correlationId);
    expect(event.outcome).toBe('allowed');
  });

  it('sets outcome to "denied" when decision.allow is false', () => {
    const denied: PolicyDecision = { allow: false, reason: 'user not in allowlist' };
    const event = buildAuditEvent(ctx, denied, correlationId);
    expect(event.outcome).toBe('denied');
  });

  it('sets correlation_id from the argument', () => {
    const allowed: PolicyDecision = { allow: true };
    const event = buildAuditEvent(ctx, allowed, correlationId);
    expect(event.correlation_id).toBe(correlationId);
  });

  it('sets a non-empty ISO timestamp', () => {
    const allowed: PolicyDecision = { allow: true };
    const event = buildAuditEvent(ctx, allowed, correlationId);
    expect(typeof event.timestamp).toBe('string');
    expect(event.timestamp.length).toBeGreaterThan(0);
    // Should be parseable as a date
    expect(isNaN(Date.parse(event.timestamp))).toBe(false);
  });

  it('includes reason in metadata when decision is denied', () => {
    const denied: PolicyDecision = { allow: false, reason: 'DMs from non-owners are disabled' };
    const event = buildAuditEvent(ctx, denied, correlationId);
    expect(event.metadata?.reason).toBe('DMs from non-owners are disabled');
  });

  it('includes source in metadata', () => {
    const allowed: PolicyDecision = { allow: true };
    const event = buildAuditEvent(ctx, allowed, correlationId);
    expect(event.metadata?.source).toBe(ctx.source);
  });
});
