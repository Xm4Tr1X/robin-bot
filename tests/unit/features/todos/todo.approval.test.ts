import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStore } from '../../../../src/store/memory.store.js';
import {
  TodoApprovalService,
  CONFIDENCE_THRESHOLD,
} from '../../../../src/features/todos/todo.approval.js';
import { initTodoLedger, ledgerHolder } from '../../../../src/todo.js';

describe('TodoApprovalService', () => {
  let store: MemoryStore;
  let svc: TodoApprovalService;

  beforeEach(() => {
    store = new MemoryStore();
    // Reset ledger to a fresh in-memory instance before each test
    initTodoLedger(new MemoryStore());
    svc = new TodoApprovalService(store);
  });

  // ---------------------------------------------------------------------------
  // propose()
  // ---------------------------------------------------------------------------

  describe('propose()', () => {
    it('creates a pending todo with correct fields', () => {
      const p = svc.propose('Fix the bug', 'high', 'short-term', 0.85, 'conv-1');
      expect(p.task).toBe('Fix the bug');
      expect(p.priority).toBe('high');
      expect(p.bucket).toBe('short-term');
      expect(p.confidence).toBe(0.85);
      expect(p.status).toBe('pending');
      expect(p.sourceConversationId).toBe('conv-1');
      expect(typeof p.id).toBe('string');
      expect(p.id.length).toBeGreaterThan(0);
    });

    it('sets createdAt and updatedAt', () => {
      const before = new Date().toISOString();
      const p = svc.propose('Fix the bug', 'high', 'short-term', 0.85, 'conv-1');
      const after = new Date().toISOString();
      expect(p.createdAt >= before).toBe(true);
      expect(p.createdAt <= after).toBe(true);
    });

    it('sets optional sourceMentionId when provided', () => {
      const p = svc.propose('Fix the bug', 'high', 'short-term', 0.85, 'conv-1', 'mention-xyz');
      expect(p.sourceMentionId).toBe('mention-xyz');
    });
  });

  // ---------------------------------------------------------------------------
  // approve()
  // ---------------------------------------------------------------------------

  describe('approve()', () => {
    it('transitions status to approved', () => {
      const p = svc.propose('Fix the bug', 'high', 'short-term', 0.9, 'conv-1');
      const approved = svc.approve(p.id, 'U_OWNER');
      expect(approved?.status).toBe('approved');
    });

    it('sets approvedBy to the given actorId', () => {
      const p = svc.propose('Fix the bug', 'high', 'short-term', 0.9, 'conv-1');
      const approved = svc.approve(p.id, 'U_OWNER');
      expect(approved?.approvedBy).toBe('U_OWNER');
    });

    it('adds the task to the live ledger', () => {
      const p = svc.propose('Fix the bug', 'high', 'short-term', 0.9, 'conv-1');
      svc.approve(p.id, 'U_OWNER');
      const all = ledgerHolder.instance.getAll();
      expect(all.some(t => t.task === 'Fix the bug')).toBe(true);
    });

    it('returns undefined for unknown id', () => {
      expect(svc.approve('non-existent', 'U_OWNER')).toBeUndefined();
    });

    it('returns undefined for an already-rejected todo', () => {
      const p = svc.propose('Fix the bug', 'high', 'short-term', 0.9, 'conv-1');
      svc.reject(p.id);
      expect(svc.approve(p.id, 'U_OWNER')).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // reject()
  // ---------------------------------------------------------------------------

  describe('reject()', () => {
    it('transitions status to rejected', () => {
      const p = svc.propose('Fix the bug', 'high', 'short-term', 0.9, 'conv-1');
      const rejected = svc.reject(p.id);
      expect(rejected?.status).toBe('rejected');
    });

    it('returns undefined for unknown id', () => {
      expect(svc.reject('non-existent')).toBeUndefined();
    });

    it('returns undefined for an already-approved todo', () => {
      const p = svc.propose('Fix the bug', 'high', 'short-term', 0.9, 'conv-1');
      svc.approve(p.id, 'U_OWNER');
      expect(svc.reject(p.id)).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // listPending()
  // ---------------------------------------------------------------------------

  describe('listPending()', () => {
    it('only returns todos with status=pending', () => {
      const p1 = svc.propose('Task 1', 'high', 'short-term', 0.9, 'conv-1');
      const p2 = svc.propose('Task 2', 'low', 'long-term', 0.8, 'conv-1');
      svc.approve(p1.id, 'U_OWNER');
      const pending = svc.listPending();
      expect(pending.every(p => p.status === 'pending')).toBe(true);
      expect(pending.some(p => p.id === p2.id)).toBe(true);
      expect(pending.some(p => p.id === p1.id)).toBe(false);
    });

    it('returns empty array when none pending', () => {
      const p = svc.propose('Task 1', 'high', 'short-term', 0.9, 'conv-1');
      svc.reject(p.id);
      expect(svc.listPending().length).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // isAboveThreshold()
  // ---------------------------------------------------------------------------

  describe('isAboveThreshold()', () => {
    it('returns true exactly at the threshold', () => {
      expect(svc.isAboveThreshold(CONFIDENCE_THRESHOLD)).toBe(true);
    });

    it('returns false just below the threshold', () => {
      expect(svc.isAboveThreshold(CONFIDENCE_THRESHOLD - 0.01)).toBe(false);
    });

    it('returns true above the threshold', () => {
      expect(svc.isAboveThreshold(1.0)).toBe(true);
    });

    it('returns false at zero', () => {
      expect(svc.isAboveThreshold(0)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // format()
  // ---------------------------------------------------------------------------

  describe('format()', () => {
    it('returns _No pending todos._ for empty array', () => {
      expect(svc.format([])).toBe('_No pending todos._');
    });

    it('includes id prefix, confidence percent, task, priority/bucket', () => {
      const p = svc.propose('Fix the bug', 'high', 'short-term', 0.85, 'conv-1');
      const output = svc.format([p]);
      expect(output).toContain(p.id.slice(0, 8));
      expect(output).toContain('85%');
      expect(output).toContain('Fix the bug');
      expect(output).toContain('high/short-term');
    });
  });
});
