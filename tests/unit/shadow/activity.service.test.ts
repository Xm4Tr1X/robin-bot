/**
 * J2 — ActivityService tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStore } from '../../../src/store/memory.store.js';
import { ActivityService } from '../../../src/shadow/activity.service.js';

describe('J2: ActivityService', () => {
  let store: MemoryStore;
  let service: ActivityService;

  beforeEach(() => {
    store = new MemoryStore();
    service = new ActivityService(store);
  });

  describe('record()', () => {
    it('persists an ActivityRecord and returns it with id and createdAt', () => {
      const record = service.record({
        channelId: 'C123',
        actorId: 'U456',
        text: 'hello world',
        ts: '1700000000.000001',
      });

      expect(record.id).toBeDefined();
      expect(record.id.length).toBeGreaterThan(0);
      expect(record.createdAt).toBeDefined();
      expect(record.channelId).toBe('C123');
      expect(record.actorId).toBe('U456');
      expect(record.text).toBe('hello world');
      expect(record.ts).toBe('1700000000.000001');
    });

    it('persists optional threadTs when provided', () => {
      const record = service.record({
        channelId: 'C123',
        actorId: 'U456',
        text: 'in a thread',
        ts: '1700000001.000001',
        threadTs: '1700000000.000001',
      });
      expect(record.threadTs).toBe('1700000000.000001');
    });

    it('persists optional threadContext when provided', () => {
      const record = service.record({
        channelId: 'C123',
        actorId: 'U456',
        text: 'reply',
        ts: '1700000002.000001',
        threadContext: 'prior message context',
      });
      expect(record.threadContext).toBe('prior message context');
    });

    it('upserts on duplicate ts+channelId (same id)', () => {
      const r1 = service.record({
        channelId: 'C123',
        actorId: 'U456',
        text: 'original',
        ts: '1700000000.000001',
      });
      const r2 = service.record({
        channelId: 'C123',
        actorId: 'U456',
        text: 'updated text',
        ts: '1700000000.000001',
      });
      // Should share the same derived id (ts+channelId keyed)
      expect(r2.id).toBe(r1.id);
      // Store should have exactly one entry
      const all = service.listRecent(100);
      expect(all).toHaveLength(1);
      expect(all[0].text).toBe('updated text');
    });
  });

  describe('listRecent()', () => {
    beforeEach(() => {
      // Insert 5 records with distinct ts values
      for (let i = 1; i <= 5; i++) {
        service.record({
          channelId: 'C123',
          actorId: 'U456',
          text: `message ${i}`,
          ts: `170000000${i}.000001`,
        });
      }
    });

    it('returns at most n records', () => {
      const results = service.listRecent(3);
      expect(results).toHaveLength(3);
    });

    it('returns newest first', () => {
      const results = service.listRecent(5);
      expect(results[0].ts).toBe('1700000005.000001');
      expect(results[4].ts).toBe('1700000001.000001');
    });

    it('listRecent(0) returns all records', () => {
      const results = service.listRecent(0);
      expect(results).toHaveLength(5);
    });

    it('returns all records when n > count', () => {
      const results = service.listRecent(100);
      expect(results).toHaveLength(5);
    });
  });

  describe('prune()', () => {
    it('removes entries older than the cutoff and returns count', () => {
      const now = Date.now();
      const old = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(); // 10 days ago
      const recent = new Date(now - 1 * 60 * 60 * 1000).toISOString(); // 1 hour ago

      // Insert directly with controlled createdAt
      store.upsert('owner_activity', {
        id: 'old-1',
        channelId: 'C1',
        actorId: 'U1',
        text: 'old',
        ts: '1',
        createdAt: old,
      });
      store.upsert('owner_activity', {
        id: 'new-1',
        channelId: 'C1',
        actorId: 'U1',
        text: 'new',
        ts: '2',
        createdAt: recent,
      });

      const count = service.prune(7 * 24 * 60 * 60 * 1000); // prune older than 7 days
      expect(count).toBe(1);
      expect(service.listRecent(100)).toHaveLength(1);
      expect(service.listRecent(100)[0].id).toBe('new-1');
    });

    it('returns 0 when nothing to prune', () => {
      service.record({ channelId: 'C1', actorId: 'U1', text: 'x', ts: '1' });
      const count = service.prune(30 * 24 * 60 * 60 * 1000);
      expect(count).toBe(0);
    });
  });
});
