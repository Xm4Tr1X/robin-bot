import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStore } from '../../../src/store/memory.store.js';
import { MemoryService } from '../../../src/memory/memory.service.js';
import type { MemoryEntry } from '../../../src/contracts.js';

describe('MemoryService', () => {
  let store: MemoryStore;
  let service: MemoryService;

  beforeEach(() => {
    store = new MemoryStore();
    service = new MemoryService(store);
  });

  // ---------------------------------------------------------------------------
  // add
  // ---------------------------------------------------------------------------

  describe('add', () => {
    it('creates an entry with a generated id', () => {
      const entry = service.add({
        conversationId: 'conv-1',
        kind: 'decision',
        content: 'Use TypeScript everywhere',
      });
      expect(typeof entry.id).toBe('string');
      expect(entry.id.length).toBeGreaterThan(0);
    });

    it('creates an entry with createdAt set to an ISO timestamp', () => {
      const before = new Date().toISOString();
      const entry = service.add({
        conversationId: 'conv-1',
        kind: 'constraint',
        content: 'No external dependencies',
      });
      const after = new Date().toISOString();
      expect(entry.createdAt >= before).toBe(true);
      expect(entry.createdAt <= after).toBe(true);
    });

    it('creates an entry with expiresAt set ~30 days from now', () => {
      const before = Date.now();
      const entry = service.add({
        conversationId: 'conv-1',
        kind: 'objective',
        content: 'Ship by Friday',
      });
      const after = Date.now();
      const expiresMs = new Date(entry.expiresAt!).getTime();
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      expect(expiresMs).toBeGreaterThanOrEqual(before + thirtyDaysMs);
      expect(expiresMs).toBeLessThanOrEqual(after + thirtyDaysMs);
    });

    it('persists the entry so it can be retrieved', () => {
      const entry = service.add({
        conversationId: 'conv-1',
        kind: 'summary',
        content: 'We discussed the roadmap',
      });
      const entries = service.getForConversation('conv-1');
      expect(entries.some((e) => e.id === entry.id)).toBe(true);
    });

    it('stores the conversationId, kind, and content as provided', () => {
      const entry = service.add({
        conversationId: 'conv-42',
        kind: 'pending_action',
        content: 'Send the report',
      });
      expect(entry.conversationId).toBe('conv-42');
      expect(entry.kind).toBe('pending_action');
      expect(entry.content).toBe('Send the report');
    });
  });

  // ---------------------------------------------------------------------------
  // getForConversation
  // ---------------------------------------------------------------------------

  describe('getForConversation', () => {
    it('returns only entries for the specified conversationId', () => {
      service.add({ conversationId: 'conv-A', kind: 'decision', content: 'A1' });
      service.add({ conversationId: 'conv-A', kind: 'summary', content: 'A2' });
      service.add({ conversationId: 'conv-B', kind: 'decision', content: 'B1' });

      const results = service.getForConversation('conv-A');
      expect(results).toHaveLength(2);
      expect(results.every((e) => e.conversationId === 'conv-A')).toBe(true);
    });

    it('returns empty array when no entries exist for that conversationId', () => {
      const results = service.getForConversation('conv-nonexistent');
      expect(results).toEqual([]);
    });

    it('excludes entries that have already expired', () => {
      // Add a valid entry
      service.add({ conversationId: 'conv-1', kind: 'decision', content: 'Active' });

      // Manually inject an expired entry into the store
      const expiredEntry: MemoryEntry = {
        id: 'expired-1',
        conversationId: 'conv-1',
        kind: 'summary',
        content: 'Expired content',
        createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(), // 60 days ago
        expiresAt: new Date(Date.now() - 1000).toISOString(), // 1 second ago
      };
      store.upsert('memory_entries', expiredEntry);

      const results = service.getForConversation('conv-1');
      expect(results.some((e) => e.id === 'expired-1')).toBe(false);
      expect(results.some((e) => e.content === 'Active')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // getByKind
  // ---------------------------------------------------------------------------

  describe('getByKind', () => {
    it('returns only entries of the specified kind for a conversationId', () => {
      service.add({ conversationId: 'conv-1', kind: 'decision', content: 'D1' });
      service.add({ conversationId: 'conv-1', kind: 'decision', content: 'D2' });
      service.add({ conversationId: 'conv-1', kind: 'constraint', content: 'C1' });

      const decisions = service.getByKind('conv-1', 'decision');
      expect(decisions).toHaveLength(2);
      expect(decisions.every((e) => e.kind === 'decision')).toBe(true);
    });

    it('returns empty array when no entries of that kind exist', () => {
      service.add({ conversationId: 'conv-1', kind: 'decision', content: 'D1' });
      const results = service.getByKind('conv-1', 'objective');
      expect(results).toEqual([]);
    });

    it('does not return entries from other conversations', () => {
      service.add({ conversationId: 'conv-A', kind: 'decision', content: 'A decision' });
      service.add({ conversationId: 'conv-B', kind: 'decision', content: 'B decision' });

      const results = service.getByKind('conv-A', 'decision');
      expect(results).toHaveLength(1);
      expect(results[0].conversationId).toBe('conv-A');
    });
  });

  // ---------------------------------------------------------------------------
  // remove
  // ---------------------------------------------------------------------------

  describe('remove', () => {
    it('deletes the entry and returns true', () => {
      const entry = service.add({
        conversationId: 'conv-1',
        kind: 'decision',
        content: 'To be removed',
      });
      const result = service.remove(entry.id);
      expect(result).toBe(true);
      const entries = service.getForConversation('conv-1');
      expect(entries.some((e) => e.id === entry.id)).toBe(false);
    });

    it('returns false when the entry does not exist', () => {
      const result = service.remove('nonexistent-id');
      expect(result).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // prune
  // ---------------------------------------------------------------------------

  describe('prune', () => {
    it('removes expired entries and returns the count', () => {
      // Active entry — should survive
      service.add({ conversationId: 'conv-1', kind: 'decision', content: 'Active' });

      // Two expired entries injected directly
      const expired1: MemoryEntry = {
        id: 'exp-1',
        conversationId: 'conv-1',
        kind: 'summary',
        content: 'Old summary 1',
        createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
        expiresAt: new Date(Date.now() - 2000).toISOString(),
      };
      const expired2: MemoryEntry = {
        id: 'exp-2',
        conversationId: 'conv-2',
        kind: 'constraint',
        content: 'Old constraint',
        createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      };
      store.upsert('memory_entries', expired1);
      store.upsert('memory_entries', expired2);

      const pruned = service.prune();
      expect(pruned).toBe(2);

      // Expired entries should be gone
      expect(store.get('memory_entries', 'exp-1')).toBeUndefined();
      expect(store.get('memory_entries', 'exp-2')).toBeUndefined();

      // Active entry should remain
      const remaining = service.getForConversation('conv-1');
      expect(remaining.some((e) => e.content === 'Active')).toBe(true);
    });

    it('returns 0 when no entries are expired', () => {
      service.add({ conversationId: 'conv-1', kind: 'decision', content: 'Active' });
      const pruned = service.prune();
      expect(pruned).toBe(0);
    });

    it('returns 0 when store is empty', () => {
      const pruned = service.prune();
      expect(pruned).toBe(0);
    });
  });
});
