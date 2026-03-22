/**
 * K3 — PatternSynthesizer tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the LLM client before importing synthesizer
vi.mock('../../../src/sandbox/llm.client.js', () => ({
  SandboxLlmClient: vi.fn(),
}));

import { PatternSynthesizer } from '../../../src/shadow/pattern.synthesizer.js';
import { SandboxLlmClient } from '../../../src/sandbox/llm.client.js';
import type { ActivityRecord } from '../../../src/shadow/activity.types.js';

function makeActivity(text: string, ts = '1700000001.000001'): ActivityRecord {
  return {
    id: `act-${ts}`,
    channelId: 'C123',
    actorId: 'U_OWNER',
    text,
    ts,
    createdAt: new Date().toISOString(),
  };
}

function makeMockClient(response: string) {
  return {
    chat: vi.fn().mockResolvedValue(response),
  };
}

describe('K3: PatternSynthesizer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns noChange:true with empty arrays when no activity records provided', async () => {
    const client = makeMockClient('{"preferences":[],"patterns":[]}');
    vi.mocked(SandboxLlmClient).mockImplementation(() => client as never);

    const synthesizer = new PatternSynthesizer('sk-ant-test');
    const result = await synthesizer.synthesize([], []);

    expect(result.noChange).toBe(true);
    expect(result.preferences).toEqual([]);
    expect(result.patterns).toEqual([]);
  });

  it('extracts preferences from LLM response', async () => {
    const client = makeMockClient(
      JSON.stringify({ preferences: ['prefers bullet lists', 'concise over verbose'], patterns: [] }),
    );
    vi.mocked(SandboxLlmClient).mockImplementation(() => client as never);

    const synthesizer = new PatternSynthesizer('sk-ant-test');
    const result = await synthesizer.synthesize([makeActivity('some activity')], []);

    expect(result.preferences).toEqual(['prefers bullet lists', 'concise over verbose']);
    expect(result.noChange).toBe(false);
  });

  it('extracts behavioral_pattern entries from LLM response', async () => {
    const client = makeMockClient(
      JSON.stringify({ preferences: [], patterns: ['checks Slack before stand-up', 'reviews PRs in the afternoon'] }),
    );
    vi.mocked(SandboxLlmClient).mockImplementation(() => client as never);

    const synthesizer = new PatternSynthesizer('sk-ant-test');
    const result = await synthesizer.synthesize([makeActivity('some activity')], []);

    expect(result.patterns).toEqual(['checks Slack before stand-up', 'reviews PRs in the afternoon']);
  });

  it('returns noChange:true on malformed/non-JSON LLM response (no throw)', async () => {
    const client = makeMockClient('not valid json at all');
    vi.mocked(SandboxLlmClient).mockImplementation(() => client as never);

    const synthesizer = new PatternSynthesizer('sk-ant-test');
    const result = await synthesizer.synthesize([makeActivity('something')], []);

    expect(result.noChange).toBe(true);
    expect(result.preferences).toEqual([]);
    expect(result.patterns).toEqual([]);
  });

  it('returns noChange:true on LLM client error (no throw)', async () => {
    const client = { chat: vi.fn().mockRejectedValue(new Error('API timeout')) };
    vi.mocked(SandboxLlmClient).mockImplementation(() => client as never);

    const synthesizer = new PatternSynthesizer('sk-ant-test');
    const result = await synthesizer.synthesize([makeActivity('something')], []);

    expect(result.noChange).toBe(true);
  });

  it('dedups patterns already in existingPatterns (case-insensitive)', async () => {
    const client = makeMockClient(
      JSON.stringify({
        preferences: ['Prefers bullet lists', 'new preference'],
        patterns: [],
      }),
    );
    vi.mocked(SandboxLlmClient).mockImplementation(() => client as never);

    const synthesizer = new PatternSynthesizer('sk-ant-test');
    const result = await synthesizer.synthesize(
      [makeActivity('something')],
      ['prefers bullet lists'], // already known
    );

    expect(result.preferences).toEqual(['new preference']);
    expect(result.preferences).not.toContain('Prefers bullet lists');
  });

  it('noChange is false when new preferences or patterns exist', async () => {
    const client = makeMockClient(JSON.stringify({ preferences: ['new pref'], patterns: [] }));
    vi.mocked(SandboxLlmClient).mockImplementation(() => client as never);

    const synthesizer = new PatternSynthesizer('sk-ant-test');
    const result = await synthesizer.synthesize([makeActivity('x')], []);

    expect(result.noChange).toBe(false);
  });

  it('noChange is true when all extracted entries are already known', async () => {
    const client = makeMockClient(
      JSON.stringify({ preferences: ['known pref'], patterns: ['known pattern'] }),
    );
    vi.mocked(SandboxLlmClient).mockImplementation(() => client as never);

    const synthesizer = new PatternSynthesizer('sk-ant-test');
    const result = await synthesizer.synthesize(
      [makeActivity('x')],
      ['known pref', 'known pattern'],
    );

    expect(result.noChange).toBe(true);
  });
});
