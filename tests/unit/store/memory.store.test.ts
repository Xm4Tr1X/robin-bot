import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStore } from '../../../src/store/memory.store.js';
import type { StoreRecord } from '../../../src/store/store.contract.js';

interface TestRecord extends StoreRecord {
  id: string;
  name: string;
  value: number;
  category?: string;
}

describe('MemoryStore', () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  // ---------------------------------------------------------------------------
  // get
  // ---------------------------------------------------------------------------

  describe('get', () => {
    it('returns undefined for a missing record', () => {
      expect(store.get('items', 'nonexistent')).toBeUndefined();
    });

    it('returns the record after upsert (roundtrip)', () => {
      const record: TestRecord = { id: 'r1', name: 'Alice', value: 42 };
      store.upsert('items', record);
      const result = store.get<TestRecord>('items', 'r1');
      expect(result).toEqual(record);
    });

    it('returns undefined when querying a different table', () => {
      const record: TestRecord = { id: 'r1', name: 'Alice', value: 42 };
      store.upsert('items', record);
      expect(store.get('other_table', 'r1')).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // upsert
  // ---------------------------------------------------------------------------

  describe('upsert', () => {
    it('overwrites an existing record by id', () => {
      store.upsert('items', { id: 'r1', name: 'Alice', value: 1 } as TestRecord);
      store.upsert('items', { id: 'r1', name: 'Bob', value: 99 } as TestRecord);
      const result = store.get<TestRecord>('items', 'r1');
      expect(result?.name).toBe('Bob');
      expect(result?.value).toBe(99);
    });
  });

  // ---------------------------------------------------------------------------
  // list
  // ---------------------------------------------------------------------------

  describe('list', () => {
    beforeEach(() => {
      store.upsert('items', { id: 'a', name: 'Zebra', value: 3, category: 'animal' } as TestRecord);
      store.upsert('items', { id: 'b', name: 'Apple', value: 1, category: 'fruit' } as TestRecord);
      store.upsert('items', { id: 'c', name: 'Mango', value: 2, category: 'fruit' } as TestRecord);
    });

    it('returns all records when no options given', () => {
      const results = store.list<TestRecord>('items');
      expect(results).toHaveLength(3);
    });

    it('returns empty array for an unknown table', () => {
      const results = store.list('unknown');
      expect(results).toEqual([]);
    });

    it('filters by where clause (matching records only)', () => {
      const results = store.list<TestRecord>('items', { where: { category: 'fruit' } });
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.category === 'fruit')).toBe(true);
    });

    it('returns empty array when where clause matches nothing', () => {
      const results = store.list<TestRecord>('items', { where: { category: 'vegetable' } });
      expect(results).toHaveLength(0);
    });

    it('filters by where clause with multiple keys (all must match)', () => {
      const results = store.list<TestRecord>('items', {
        where: { category: 'fruit', name: 'Mango' },
      });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('c');
    });

    it('sorts ascending by field', () => {
      const results = store.list<TestRecord>('items', {
        orderBy: { field: 'name', dir: 'asc' },
      });
      expect(results.map((r) => r.name)).toEqual(['Apple', 'Mango', 'Zebra']);
    });

    it('sorts descending by field', () => {
      const results = store.list<TestRecord>('items', {
        orderBy: { field: 'name', dir: 'desc' },
      });
      expect(results.map((r) => r.name)).toEqual(['Zebra', 'Mango', 'Apple']);
    });

    it('applies limit and returns at most N records', () => {
      const results = store.list<TestRecord>('items', { limit: 2 });
      expect(results).toHaveLength(2);
    });

    it('applies offset to skip N records', () => {
      const all = store.list<TestRecord>('items', { orderBy: { field: 'id', dir: 'asc' } });
      const withOffset = store.list<TestRecord>('items', {
        orderBy: { field: 'id', dir: 'asc' },
        offset: 1,
      });
      expect(withOffset).toHaveLength(2);
      expect(withOffset[0].id).toBe(all[1].id);
    });

    it('applies limit after offset', () => {
      const results = store.list<TestRecord>('items', {
        orderBy: { field: 'id', dir: 'asc' },
        offset: 1,
        limit: 1,
      });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('b');
    });
  });

  // ---------------------------------------------------------------------------
  // delete
  // ---------------------------------------------------------------------------

  describe('delete', () => {
    it('removes the record and returns true when found', () => {
      store.upsert('items', { id: 'r1', name: 'Alice', value: 1 } as TestRecord);
      const result = store.delete('items', 'r1');
      expect(result).toBe(true);
      expect(store.get('items', 'r1')).toBeUndefined();
    });

    it('returns false when the record does not exist', () => {
      const result = store.delete('items', 'nonexistent');
      expect(result).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // deleteWhere
  // ---------------------------------------------------------------------------

  describe('deleteWhere', () => {
    beforeEach(() => {
      store.upsert('items', { id: 'a', name: 'Alice', value: 1, category: 'fruit' } as TestRecord);
      store.upsert('items', { id: 'b', name: 'Bob', value: 2, category: 'fruit' } as TestRecord);
      store.upsert('items', { id: 'c', name: 'Carol', value: 3, category: 'animal' } as TestRecord);
    });

    it('removes all matching records and returns the count', () => {
      const count = store.deleteWhere('items', { category: 'fruit' });
      expect(count).toBe(2);
      expect(store.list('items')).toHaveLength(1);
    });

    it('returns 0 when no records match', () => {
      const count = store.deleteWhere('items', { category: 'vegetable' });
      expect(count).toBe(0);
      expect(store.list('items')).toHaveLength(3);
    });

    it('matches on multiple keys (all must match)', () => {
      const count = store.deleteWhere('items', { category: 'fruit', name: 'Alice' });
      expect(count).toBe(1);
      expect(store.get('items', 'a')).toBeUndefined();
      expect(store.get('items', 'b')).toBeDefined();
    });

    it('returns 0 for an unknown table', () => {
      const count = store.deleteWhere('unknown', { category: 'fruit' });
      expect(count).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // close
  // ---------------------------------------------------------------------------

  describe('close', () => {
    it('is a no-op and does not throw', () => {
      expect(() => store.close()).not.toThrow();
    });
  });
});
