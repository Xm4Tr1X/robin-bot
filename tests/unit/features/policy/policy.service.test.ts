import { describe, it, expect, beforeEach } from 'vitest';
import { PolicyService } from '../../../../src/features/policy/policy.service.js';
import type { PolicyState } from '../../../../src/features/policy/policy.service.js';

const BASE_STATE: PolicyState = {
  ownerUserId: 'U_OWNER',
  allowConversationsWithOthers: false,
  allowDmFromOthers: false,
  allowMentionsFromOthers: false,
  allowedUserIds: [],
  allowedChannelIds: [],
};

describe('PolicyService', () => {
  let svc: PolicyService;

  beforeEach(() => {
    svc = new PolicyService({ ...BASE_STATE });
  });

  // ---------------------------------------------------------------------------
  // get()
  // ---------------------------------------------------------------------------

  describe('get()', () => {
    it('returns a snapshot of the current state', () => {
      const state = svc.get();
      expect(state.ownerUserId).toBe('U_OWNER');
      expect(state.allowConversationsWithOthers).toBe(false);
    });

    it('returns a copy — mutations do not affect internal state', () => {
      const state = svc.get();
      state.ownerUserId = 'MUTATED';
      expect(svc.get().ownerUserId).toBe('U_OWNER');
    });

    it('deep-copies allowedUserIds', () => {
      const state = svc.get();
      state.allowedUserIds.push('U_INJECTED');
      expect(svc.get().allowedUserIds).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // set() — boolean fields
  // ---------------------------------------------------------------------------

  describe('set() boolean fields', () => {
    it('sets allowConversationsWithOthers to true', () => {
      const result = svc.set('allowConversationsWithOthers', 'true');
      expect(result.ok).toBe(true);
      expect(svc.get().allowConversationsWithOthers).toBe(true);
    });

    it('sets allowDmFromOthers to false', () => {
      svc.set('allowDmFromOthers', 'true');
      svc.set('allowDmFromOthers', 'false');
      expect(svc.get().allowDmFromOthers).toBe(false);
    });

    it('sets allowMentionsFromOthers', () => {
      const result = svc.set('allowMentionsFromOthers', 'true');
      expect(result.ok).toBe(true);
      expect(svc.get().allowMentionsFromOthers).toBe(true);
    });

    it('rejects non-boolean value', () => {
      const result = svc.set('allowDmFromOthers', 'yes');
      expect(result.ok).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------------------
  // set() — ownerUserId
  // ---------------------------------------------------------------------------

  describe('set() ownerUserId', () => {
    it('updates ownerUserId', () => {
      const result = svc.set('ownerUserId', 'U_NEW');
      expect(result.ok).toBe(true);
      expect(svc.get().ownerUserId).toBe('U_NEW');
    });

    it('trims whitespace', () => {
      svc.set('ownerUserId', '  U_NEW  ');
      expect(svc.get().ownerUserId).toBe('U_NEW');
    });
  });

  // ---------------------------------------------------------------------------
  // set() — list fields
  // ---------------------------------------------------------------------------

  describe('set() list fields', () => {
    it('sets allowedUserIds from comma-separated string', () => {
      const result = svc.set('allowedUserIds', 'U1, U2, U3');
      expect(result.ok).toBe(true);
      expect(svc.get().allowedUserIds).toEqual(['U1', 'U2', 'U3']);
    });

    it('sets allowedChannelIds', () => {
      svc.set('allowedChannelIds', 'C_GENERAL,C_ALERTS');
      expect(svc.get().allowedChannelIds).toEqual(['C_GENERAL', 'C_ALERTS']);
    });

    it('filters empty entries', () => {
      svc.set('allowedUserIds', 'U1,,U2,');
      expect(svc.get().allowedUserIds).toEqual(['U1', 'U2']);
    });
  });

  // ---------------------------------------------------------------------------
  // set() — unknown field
  // ---------------------------------------------------------------------------

  describe('set() unknown field', () => {
    it('returns ok=false with descriptive error', () => {
      const result = svc.set('secretField', 'value');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('secretField');
    });
  });

  // ---------------------------------------------------------------------------
  // format()
  // ---------------------------------------------------------------------------

  describe('format()', () => {
    it('includes ownerUserId', () => {
      expect(svc.format()).toContain('U_OWNER');
    });

    it('shows (not set) when ownerUserId is empty', () => {
      svc.set('ownerUserId', '');
      expect(svc.format()).toContain('not set');
    });

    it('includes all boolean fields', () => {
      const output = svc.format();
      expect(output).toContain('allowConversationsWithOthers');
      expect(output).toContain('allowDmFromOthers');
      expect(output).toContain('allowMentionsFromOthers');
    });

    it('shows (none) when allowedUserIds is empty', () => {
      expect(svc.format()).toContain('(none)');
    });

    it('shows user IDs when allowedUserIds is populated', () => {
      svc.set('allowedUserIds', 'U1, U2');
      expect(svc.format()).toContain('U1');
      expect(svc.format()).toContain('U2');
    });
  });
});
