/**
 * K1 — Global memory scope tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStore } from '../../../src/store/memory.store.js';
import { MemoryService } from '../../../src/memory/memory.service.js';
import type { MemoryEntry } from '../../../src/contracts.js';

describe('K1: Global memory scope', () => {
  let store: MemoryStore;
  let service: MemoryService;

  beforeEach(() => {
    store = new MemoryStore();
    service = new MemoryService(store);
  });

  describe('addGlobal()', () => {
    it('stores entry with scope global and no conversationId', () => {
      const entry = service.addGlobal('preference', 'ninaad prefers concise replies');
      expect(entry.scope).toBe('global');
      expect(entry.conversationId).toBeUndefined();
      expect(entry.kind).toBe('preference');
      expect(entry.content).toBe('ninaad prefers concise replies');
    });

    it('generates an id and createdAt', () => {
      const entry = service.addGlobal('behavioral_pattern', 'checks Slack before stand-up');
      expect(entry.id.length).toBeGreaterThan(0);
      expect(entry.createdAt).toBeDefined();
    });

    it('persists to the store so getGlobal can retrieve it', () => {
      service.addGlobal('preference', 'test preference');
      const global = service.getGlobal();
      expect(global.some((e) => e.content === 'test preference')).toBe(true);
    });
  });

  describe('getGlobal()', () => {
    it('returns only scope=global entries', () => {
      service.addGlobal('preference', 'global pref');
      service.add({ conversationId: 'conv-1', kind: 'decision', content: 'conv decision' });

      const global = service.getGlobal();
      expect(global.every((e) => e.scope === 'global')).toBe(true);
      expect(global).toHaveLength(1);
    });

    it('returns empty array when no global entries exist', () => {
      service.add({ conversationId: 'conv-1', kind: 'decision', content: 'local' });
      expect(service.getGlobal()).toEqual([]);
    });

    it('excludes expired global entries', () => {
      service.addGlobal('preference', 'active global');

      const expired: MemoryEntry = {
        id: 'global-expired',
        scope: 'global',
        kind: 'preference',
        content: 'expired global',
        createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      };
      store.upsert('memory_entries', expired);

      const global = service.getGlobal();
      expect(global.some((e) => e.id === 'global-expired')).toBe(false);
      expect(global.some((e) => e.content === 'active global')).toBe(true);
    });
  });

  describe('getByKindGlobal()', () => {
    it('returns only global entries of the specified kind', () => {
      service.addGlobal('preference', 'pref 1');
      service.addGlobal('behavioral_pattern', 'pattern 1');
      service.addGlobal('preference', 'pref 2');

      const prefs = service.getByKindGlobal('preference');
      expect(prefs).toHaveLength(2);
      expect(prefs.every((e) => e.kind === 'preference' && e.scope === 'global')).toBe(true);
    });

    it('returns empty array when no global entries of that kind exist', () => {
      service.addGlobal('preference', 'pref');
      expect(service.getByKindGlobal('behavioral_pattern')).toEqual([]);
    });
  });

  describe('getForConversation() still only returns conversation-scoped entries', () => {
    it('does not include global entries', () => {
      service.addGlobal('preference', 'global pref');
      service.add({ conversationId: 'conv-1', kind: 'decision', content: 'local decision' });

      const conv = service.getForConversation('conv-1');
      expect(conv.every((e) => e.scope !== 'global')).toBe(true);
      expect(conv).toHaveLength(1);
    });
  });

  describe('prune() respects both scopes', () => {
    it('prunes expired global entries', () => {
      service.addGlobal('preference', 'active global');

      const expired: MemoryEntry = {
        id: 'global-exp',
        scope: 'global',
        kind: 'preference',
        content: 'expired',
        createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      };
      store.upsert('memory_entries', expired);

      const pruned = service.prune();
      expect(pruned).toBeGreaterThanOrEqual(1);
      expect(store.get('memory_entries', 'global-exp')).toBeUndefined();
    });
  });
});
