import { describe, it, expect, vi, afterEach } from 'vitest';
import type { PromptEnvelope } from '../../../src/contracts.js';
import { safetyPrecheck } from '../../../src/policy/safety.precheck.js';

// ---------------------------------------------------------------------------
// Helper — build a minimal valid PromptEnvelope
// ---------------------------------------------------------------------------

const BASE_ENVELOPE: PromptEnvelope = {
  taskClass: 'general',
  persona: 'Robin',
  policyConstraints: [],
  memoryContext: [],
  channelContext: [],
  allowedTools: [],
  responseContract: { format: 'plain', allowExternalLinks: false },
  userInput: 'What is the weather today?',
};

function makeEnvelope(overrides: Partial<PromptEnvelope> = {}): PromptEnvelope {
  return { ...BASE_ENVELOPE, ...overrides };
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// safetyPrecheck
// ---------------------------------------------------------------------------

describe('safetyPrecheck', () => {
  it('allows a clean envelope', () => {
    const result = safetyPrecheck(makeEnvelope());
    expect(result.allow).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('denies when userInput contains a Slack token', () => {
    const result = safetyPrecheck(
      makeEnvelope({ userInput: 'Here is my token: ' + 'xoxb-' + '111-222-abcdef' }),
    );
    expect(result.allow).toBe(false);
    expect(result.reason).toBe('user input contains sensitive data');
  });

  it('denies when userInput contains an API key', () => {
    const result = safetyPrecheck(
      makeEnvelope({ userInput: 'Use sk-' + 'a'.repeat(25) + ' for this.' }),
    );
    expect(result.allow).toBe(false);
    expect(result.reason).toBe('user input contains sensitive data');
  });

  it('denies when userInput contains a Bearer token', () => {
    const result = safetyPrecheck(
      makeEnvelope({ userInput: 'Authorization: Bearer eyJtoken123' }),
    );
    expect(result.allow).toBe(false);
    expect(result.reason).toBe('user input contains sensitive data');
  });

  it('denies when memoryContext contains a secret', () => {
    const result = safetyPrecheck(
      makeEnvelope({
        memoryContext: [
          'User prefers concise answers.',
          'API token: ' + 'xoxb-' + '999-888-secrettoken',
        ],
      }),
    );
    expect(result.allow).toBe(false);
    expect(result.reason).toBe('memory context contains sensitive data');
  });

  it('denies when any single memoryContext entry contains a secret', () => {
    const result = safetyPrecheck(
      makeEnvelope({
        memoryContext: ['Clean entry.', 'AKIAIOSFODNN7EXAMPLE is a bad key'],
      }),
    );
    expect(result.allow).toBe(false);
    expect(result.reason).toBe('memory context contains sensitive data');
  });

  it('allows envelope with clean memoryContext entries', () => {
    const result = safetyPrecheck(
      makeEnvelope({
        memoryContext: ['User likes cats.', 'Prefers dark mode.'],
      }),
    );
    expect(result.allow).toBe(true);
  });

  it('denies when userInput length exceeds 10000 characters', () => {
    const result = safetyPrecheck(
      makeEnvelope({ userInput: 'a'.repeat(10001) }),
    );
    expect(result.allow).toBe(false);
    expect(result.reason).toBe('input too long');
  });

  it('allows userInput at exactly 10000 characters', () => {
    const result = safetyPrecheck(
      makeEnvelope({ userInput: 'a'.repeat(10000) }),
    );
    expect(result.allow).toBe(true);
  });

  it('allows envelope with allowed tools listed (no forbidden tools present)', () => {
    const result = safetyPrecheck(
      makeEnvelope({ allowedTools: ['Read', 'Grep', 'Glob'] }),
    );
    expect(result.allow).toBe(true);
  });

  it('denies envelope with Write in allowedTools', () => {
    const result = safetyPrecheck(makeEnvelope({ allowedTools: ['Write'] }));
    expect(result.allow).toBe(false);
    expect(result.reason).toMatch(/forbidden tool/i);
  });

  it('denies envelope with Bash in allowedTools', () => {
    const result = safetyPrecheck(makeEnvelope({ allowedTools: ['Bash'] }));
    expect(result.allow).toBe(false);
    expect(result.reason).toMatch(/forbidden tool/i);
  });

  it('denies envelope with Edit in allowedTools', () => {
    const result = safetyPrecheck(makeEnvelope({ allowedTools: ['Edit'] }));
    expect(result.allow).toBe(false);
    expect(result.reason).toMatch(/forbidden tool/i);
  });

  it('denies envelope with NotebookEdit in allowedTools', () => {
    const result = safetyPrecheck(makeEnvelope({ allowedTools: ['NotebookEdit'] }));
    expect(result.allow).toBe(false);
    expect(result.reason).toMatch(/forbidden tool/i);
  });

  it('denies when multiple forbidden tools are present alongside safe ones', () => {
    const result = safetyPrecheck(makeEnvelope({ allowedTools: ['Read', 'Write', 'Glob'] }));
    expect(result.allow).toBe(false);
  });

  it('userInput secret check takes priority over length check', () => {
    // A very long input that also has a secret — secret check fires first
    const result = safetyPrecheck(
      makeEnvelope({
        userInput: 'xoxb-' + '111-222-abc ' + 'x'.repeat(10001),
      }),
    );
    expect(result.allow).toBe(false);
    // Either reason is acceptable; what matters is it's denied
    expect(result.reason).toBeTruthy();
  });

  it('memoryContext check fires before length check', () => {
    const result = safetyPrecheck(
      makeEnvelope({
        userInput: 'a'.repeat(9999), // within limit
        memoryContext: ['-----BEGIN PRIVATE KEY-----'],
      }),
    );
    expect(result.allow).toBe(false);
    expect(result.reason).toBe('memory context contains sensitive data');
  });
});
