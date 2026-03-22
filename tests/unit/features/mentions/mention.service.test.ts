import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStore } from '../../../../src/store/memory.store.js';
import { MentionService } from '../../../../src/features/mentions/mention.service.js';
import type { MentionRecord } from '../../../../src/features/mentions/mention.types.js';

describe('MentionService', () => {
  let store: MemoryStore;
  let svc: MentionService;

  const BASE_PARAMS: Omit<MentionRecord, 'id' | 'status' | 'createdAt' | 'updatedAt'> = {
    actorId: 'U_TEST',
    source: 'slack',
    channelId: 'C_TEST',
    conversationId: 'C_TEST:12345',
    text: 'Hey Robin, can you look into this issue?',
    ts: '12345.678',
  };

  beforeEach(() => {
    store = new MemoryStore();
    svc = new MentionService(store);
  });

  // ---------------------------------------------------------------------------
  // record()
  // ---------------------------------------------------------------------------

  describe('record()', () => {
    it('creates a mention with status=new', () => {
      const m = svc.record(BASE_PARAMS);
      expect(m.status).toBe('new');
    });

    it('generates a unique id', () => {
      const m1 = svc.record(BASE_PARAMS);
      const m2 = svc.record(BASE_PARAMS);
      expect(m1.id).not.toBe(m2.id);
      expect(m1.id.length).toBeGreaterThan(0);
    });

    it('sets ISO createdAt and updatedAt', () => {
      const before = new Date().toISOString();
      const m = svc.record(BASE_PARAMS);
      const after = new Date().toISOString();
      expect(m.createdAt >= before).toBe(true);
      expect(m.createdAt <= after).toBe(true);
      expect(m.updatedAt >= before).toBe(true);
    });

    it('persists the mention', () => {
      const m = svc.record(BASE_PARAMS);
      const all = svc.listByStatus();
      expect(all.some(x => x.id === m.id)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // transition()
  // ---------------------------------------------------------------------------

  describe('transition()', () => {
    it('updates the status', () => {
      const m = svc.record(BASE_PARAMS);
      const updated = svc.transition(m.id, 'triaged');
      expect(updated?.status).toBe('triaged');
    });

    it('returns undefined for unknown id', () => {
      expect(svc.transition('non-existent', 'triaged')).toBeUndefined();
    });

    it('merges extra fields', () => {
      const m = svc.record(BASE_PARAMS);
      const updated = svc.transition(m.id, 'converted', { convertedTodoId: 'todo-abc' });
      expect(updated?.convertedTodoId).toBe('todo-abc');
      expect(updated?.status).toBe('converted');
    });

    it('preserves the original id', () => {
      const m = svc.record(BASE_PARAMS);
      const updated = svc.transition(m.id, 'done');
      expect(updated?.id).toBe(m.id);
    });
  });

  // ---------------------------------------------------------------------------
  // listByStatus()
  // ---------------------------------------------------------------------------

  describe('listByStatus()', () => {
    it('returns all when called with no args', () => {
      svc.record(BASE_PARAMS);
      svc.record({ ...BASE_PARAMS, actorId: 'U_OTHER' });
      expect(svc.listByStatus().length).toBe(2);
    });

    it('filters by a single status', () => {
      const m = svc.record(BASE_PARAMS);
      svc.transition(m.id, 'triaged');
      svc.record({ ...BASE_PARAMS, actorId: 'U_OTHER' }); // stays 'new'
      const newOnes = svc.listByStatus('new');
      expect(newOnes.every(x => x.status === 'new')).toBe(true);
      expect(newOnes.length).toBe(1);
    });

    it('filters by multiple statuses', () => {
      const m1 = svc.record(BASE_PARAMS);
      const m2 = svc.record({ ...BASE_PARAMS, actorId: 'U2' });
      svc.transition(m1.id, 'triaged');
      svc.transition(m2.id, 'dismissed');
      const result = svc.listByStatus('triaged', 'dismissed');
      expect(result.length).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // getStale()
  // ---------------------------------------------------------------------------

  describe('getStale()', () => {
    it('returns new mentions older than the threshold', () => {
      const m = svc.record(BASE_PARAMS);
      // Backdate createdAt to 8 days ago
      store.upsert('mentions', {
        ...m,
        createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      });
      const stale = svc.getStale(7 * 24 * 60 * 60 * 1000);
      expect(stale.some(x => x.id === m.id)).toBe(true);
    });

    it('excludes mentions newer than the threshold', () => {
      svc.record(BASE_PARAMS);
      expect(svc.getStale(7 * 24 * 60 * 60 * 1000).length).toBe(0);
    });

    it('excludes non-new mentions even if old', () => {
      const m = svc.record(BASE_PARAMS);
      svc.transition(m.id, 'triaged');
      store.upsert('mentions', {
        ...store.get<MentionRecord>('mentions', m.id)!,
        createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      });
      expect(svc.getStale(7 * 24 * 60 * 60 * 1000).length).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // format()
  // ---------------------------------------------------------------------------

  describe('format()', () => {
    it('returns _No mentions._ for empty array', () => {
      expect(svc.format([])).toBe('_No mentions._');
    });

    it('includes id prefix, status, text snippet, and actorId', () => {
      const m = svc.record(BASE_PARAMS);
      const output = svc.format([m]);
      expect(output).toContain(m.id.slice(0, 8));
      expect(output).toContain('[new]');
      expect(output).toContain(BASE_PARAMS.actorId);
    });

    it('formats multiple mentions as separate lines', () => {
      const m1 = svc.record(BASE_PARAMS);
      const m2 = svc.record({ ...BASE_PARAMS, actorId: 'U_OTHER' });
      const output = svc.format([m1, m2]);
      expect(output.split('\n').length).toBe(2);
    });
  });
});
