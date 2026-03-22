/**
 * L4 — StagingService tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStore } from '../../../../src/store/memory.store.js';
import { StagingService } from '../../../../src/features/staging/staging.service.js';

describe('L4: StagingService', () => {
  let store: MemoryStore;
  let service: StagingService;

  beforeEach(() => {
    store = new MemoryStore();
    service = new StagingService(store);
  });

  describe('stage()', () => {
    it('persists a StagedAction with status pending and returns it', () => {
      const action = service.stage({
        conversationId: 'conv-1',
        text: 'Proposed: send update to #general',
        riskLevel: 'medium',
      });

      expect(action.id.length).toBeGreaterThan(0);
      expect(action.status).toBe('pending');
      expect(action.conversationId).toBe('conv-1');
      expect(action.text).toBe('Proposed: send update to #general');
      expect(action.riskLevel).toBe('medium');
      expect(action.createdAt).toBeDefined();
    });
  });

  describe('approve()', () => {
    it('returns the staged text and marks the action approved', () => {
      const action = service.stage({ conversationId: 'c', text: 'do the thing', riskLevel: 'medium' });
      const result = service.approve(action.id);

      expect(result.ok).toBe(true);
      expect(result.text).toBe('do the thing');

      const pending = service.listPending();
      expect(pending.some((a) => a.id === action.id)).toBe(false);
    });

    it('returns error string for unknown id', () => {
      const result = service.approve('nonexistent-id');
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/not found/i);
    });

    it('returns error when trying to approve an already-approved action', () => {
      const action = service.stage({ conversationId: 'c', text: 'x', riskLevel: 'medium' });
      service.approve(action.id);
      const second = service.approve(action.id);
      expect(second.ok).toBe(false);
    });
  });

  describe('reject()', () => {
    it('marks action as rejected and returns a confirmation string', () => {
      const action = service.stage({ conversationId: 'c', text: 'risky thing', riskLevel: 'medium' });
      const result = service.reject(action.id);

      expect(result.ok).toBe(true);
      expect(result.message).toBeDefined();

      const pending = service.listPending();
      expect(pending.some((a) => a.id === action.id)).toBe(false);
    });

    it('returns error for unknown id', () => {
      const result = service.reject('bad-id');
      expect(result.ok).toBe(false);
    });
  });

  describe('listPending()', () => {
    it('returns only pending entries', () => {
      const a1 = service.stage({ conversationId: 'c', text: 'action 1', riskLevel: 'medium' });
      const a2 = service.stage({ conversationId: 'c', text: 'action 2', riskLevel: 'medium' });
      service.approve(a1.id);

      const pending = service.listPending();
      expect(pending.some((a) => a.id === a1.id)).toBe(false);
      expect(pending.some((a) => a.id === a2.id)).toBe(true);
    });

    it('returns empty array when no pending actions', () => {
      expect(service.listPending()).toEqual([]);
    });
  });
});
