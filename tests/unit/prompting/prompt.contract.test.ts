import { describe, it, expect } from 'vitest';
import type { PromptEnvelope } from '../../../src/contracts.js';
import { envelopeToPromptString } from '../../../src/prompting/prompt.contract.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEnvelope(overrides: Partial<PromptEnvelope> = {}): PromptEnvelope {
  return {
    taskClass: 'general',
    persona: 'You are robin, a personal assistant.',
    policyConstraints: [],
    memoryContext: [],
    channelContext: ['[mode: observe]', '[source: slack]'],
    allowedTools: ['Read', 'Bash'],
    responseContract: {
      format: 'slack_mrkdwn',
      allowExternalLinks: false,
      maxLength: 4000,
    },
    userInput: 'hello world',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// envelopeToPromptString
// ---------------------------------------------------------------------------

describe('envelopeToPromptString', () => {
  it("output contains 'User: {userInput}'", () => {
    const result = envelopeToPromptString(makeEnvelope({ userInput: 'what is the status?' }));
    expect(result).toContain('User: what is the status?');
  });

  it('output contains the mode from channelContext', () => {
    const result = envelopeToPromptString(makeEnvelope({
      channelContext: ['[mode: reply]', '[source: cli]'],
    }));
    expect(result).toContain('[mode: reply]');
  });

  it("empty policyConstraints shows 'none'", () => {
    const result = envelopeToPromptString(makeEnvelope({ policyConstraints: [] }));
    expect(result).toContain('none');
  });

  it('non-empty policyConstraints are joined by semicolon and appear in output', () => {
    const result = envelopeToPromptString(makeEnvelope({
      policyConstraints: ['no secrets', 'no external links'],
    }));
    expect(result).toContain('no secrets; no external links');
  });

  it('memory entries appear in output', () => {
    const result = envelopeToPromptString(makeEnvelope({
      memoryContext: ['[objective] Fix the CI pipeline', '[constraint] No deploys on Friday'],
    }));
    expect(result).toContain('[objective] Fix the CI pipeline');
    expect(result).toContain('[constraint] No deploys on Friday');
  });

  it("empty memoryContext shows 'none'", () => {
    const result = envelopeToPromptString(makeEnvelope({ memoryContext: [] }));
    // The [Memory: section should contain 'none'
    expect(result).toContain('none');
  });

  it('output contains allowed tools', () => {
    const result = envelopeToPromptString(makeEnvelope({ allowedTools: ['Read', 'Glob', 'WebSearch'] }));
    expect(result).toContain('Read, Glob, WebSearch');
  });

  it("empty allowedTools shows 'none'", () => {
    const result = envelopeToPromptString(makeEnvelope({ allowedTools: [] }));
    expect(result).toContain('none');
  });

  it('output contains the [Mode:] label', () => {
    const result = envelopeToPromptString(makeEnvelope());
    expect(result).toMatch(/\[Mode:/);
  });

  it('output contains the [Policy:] label', () => {
    const result = envelopeToPromptString(makeEnvelope());
    expect(result).toMatch(/\[Policy:/);
  });

  it('output contains the [Memory:] label', () => {
    const result = envelopeToPromptString(makeEnvelope());
    expect(result).toMatch(/\[Memory:/);
  });

  it('output contains the [Active tools:] label', () => {
    const result = envelopeToPromptString(makeEnvelope());
    expect(result).toMatch(/\[Active tools:/);
  });

  it('User: line appears after the header blocks', () => {
    const result = envelopeToPromptString(makeEnvelope({ userInput: 'ping' }));
    const modeIdx = result.indexOf('[Mode:');
    const userIdx = result.indexOf('User: ping');
    expect(userIdx).toBeGreaterThan(modeIdx);
  });

  // Bug A regression tests — [current todos] block must appear in prompt output
  it('[current todos] block in channelContext appears in prompt output', () => {
    const todos = '• [`abc12345`] *taza tindi* — medium | _todo_';
    const result = envelopeToPromptString(makeEnvelope({
      channelContext: ['[mode: reply]', '[source: cli]', `[current todos]\n${todos}`],
    }));
    expect(result).toContain('[current todos]');
    expect(result).toContain('taza tindi');
  });

  it('[current todos] block appears before User: line', () => {
    const todos = '• [`abc12345`] *taza tindi* — medium | _todo_';
    const result = envelopeToPromptString(makeEnvelope({
      channelContext: ['[mode: reply]', '[source: cli]', `[current todos]\n${todos}`],
      userInput: 'mark taza as done',
    }));
    const todoIdx = result.indexOf('[current todos]');
    const userIdx = result.indexOf('User:');
    expect(todoIdx).toBeGreaterThan(-1);
    expect(todoIdx).toBeLessThan(userIdx);
  });

  it('empty todos do not add noise — no [current todos] block when absent', () => {
    const result = envelopeToPromptString(makeEnvelope({
      channelContext: ['[mode: reply]', '[source: cli]'],
    }));
    expect(result).not.toContain('[current todos]');
  });
});
