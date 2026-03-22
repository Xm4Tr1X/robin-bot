/**
 * K2 — Pattern memory kinds and prompt injection tests.
 */

import { describe, it, expect } from 'vitest';
import { formatMemoryContext } from '../../../src/memory/memory.retriever.js';
import { buildPromptEnvelope } from '../../../src/prompting/prompt.builder.js';
import type { MemoryEntry, IngressEvent } from '../../../src/contracts.js';

function makeGlobalEntry(kind: MemoryEntry['kind'], content: string): MemoryEntry {
  return {
    id: 'g-1',
    scope: 'global',
    kind,
    content,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeConvEntry(kind: MemoryEntry['kind'], content: string): MemoryEntry {
  return {
    id: 'c-1',
    conversationId: 'conv-1',
    scope: 'conversation',
    kind,
    content,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeEvent(): IngressEvent {
  return {
    id: 'evt-1',
    source: 'slack',
    actorId: 'U_OWNER',
    conversationId: 'conv-1',
    text: 'help me',
    ts: '1700000001.000001',
  };
}

describe('K2: Pattern memory kinds', () => {
  describe('formatMemoryContext', () => {
    it('formats preference entries as [preference] ...', () => {
      const entry = makeGlobalEntry('preference', 'prefers concise answers');
      const formatted = formatMemoryContext([entry]);
      expect(formatted[0]).toBe('[preference] prefers concise answers');
    });

    it('formats behavioral_pattern entries as [behavioral_pattern] ...', () => {
      const entry = makeGlobalEntry('behavioral_pattern', 'checks Slack before stand-up');
      const formatted = formatMemoryContext([entry]);
      expect(formatted[0]).toBe('[behavioral_pattern] checks Slack before stand-up');
    });

    it('formats existing kinds correctly too', () => {
      const entry = makeConvEntry('decision', 'use TypeScript');
      const formatted = formatMemoryContext([entry]);
      expect(formatted[0]).toBe('[decision] use TypeScript');
    });
  });

  describe('buildPromptEnvelope with global entries', () => {
    it('includes global memory when globalEntries provided', () => {
      const globalEntries = [makeGlobalEntry('preference', 'likes bullet points')];
      const envelope = buildPromptEnvelope({
        event: makeEvent(),
        memoryEntries: [],
        sessionMode: 'reply',
        allowedTools: [],
        globalEntries,
      });
      expect(envelope.memoryContext.some((s) => s.includes('likes bullet points'))).toBe(true);
    });

    it('global patterns appear before conversation-local memory', () => {
      const globalEntries = [makeGlobalEntry('preference', 'global pref')];
      const localEntries = [makeConvEntry('decision', 'local decision')];
      const envelope = buildPromptEnvelope({
        event: makeEvent(),
        memoryEntries: localEntries,
        sessionMode: 'reply',
        allowedTools: [],
        globalEntries,
      });
      const globalIdx = envelope.memoryContext.findIndex((s) => s.includes('global pref'));
      const localIdx = envelope.memoryContext.findIndex((s) => s.includes('local decision'));
      expect(globalIdx).toBeLessThan(localIdx);
    });

    it('empty globalEntries do not add noise to the envelope', () => {
      const envelope = buildPromptEnvelope({
        event: makeEvent(),
        memoryEntries: [],
        sessionMode: 'reply',
        allowedTools: [],
        globalEntries: [],
      });
      // memoryContext should be empty (no global, no local)
      expect(envelope.memoryContext).toHaveLength(0);
    });

    it('works when globalEntries is omitted (backward compatible)', () => {
      const envelope = buildPromptEnvelope({
        event: makeEvent(),
        memoryEntries: [],
        sessionMode: 'reply',
        allowedTools: [],
      });
      expect(envelope.memoryContext).toHaveLength(0);
    });

    it('global entries are labelled with [owner context] prefix', () => {
      const globalEntries = [
        makeGlobalEntry('preference', 'pref A'),
        makeGlobalEntry('behavioral_pattern', 'pattern B'),
      ];
      const envelope = buildPromptEnvelope({
        event: makeEvent(),
        memoryEntries: [],
        sessionMode: 'reply',
        allowedTools: [],
        globalEntries,
      });
      // At least one entry should carry the owner context label
      expect(
        envelope.memoryContext.some((s) => s.includes('[owner context]')),
      ).toBe(true);
    });
  });
});
