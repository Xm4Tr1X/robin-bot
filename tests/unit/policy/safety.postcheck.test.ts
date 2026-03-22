import { describe, it, expect } from 'vitest';
import type { RunnerResponse } from '../../../src/contracts.js';
import { safetyPostcheck } from '../../../src/policy/safety.postcheck.js';

// ---------------------------------------------------------------------------
// Helper — build a minimal valid RunnerResponse
// ---------------------------------------------------------------------------

const BASE_RESPONSE: RunnerResponse = {
  requestId: 'req-001',
  sessionId: 'sess-001',
  text: 'Here is your answer.',
  toolTrace: [],
};

function makeResponse(overrides: Partial<RunnerResponse> = {}): RunnerResponse {
  return { ...BASE_RESPONSE, ...overrides };
}

// ---------------------------------------------------------------------------
// safetyPostcheck
// ---------------------------------------------------------------------------

describe('safetyPostcheck', () => {
  it('allows a clean response and returns safeText equal to original text', () => {
    const response = makeResponse({ text: 'Hello, world!' });
    const result = safetyPostcheck(response);
    expect(result.allow).toBe(true);
    expect(result.safeText).toBe('Hello, world!');
    expect(result.redactions).toBeUndefined();
  });

  it('denies an empty response text', () => {
    const result = safetyPostcheck(makeResponse({ text: '' }));
    expect(result.allow).toBe(false);
    expect(result.reason).toBe('empty response');
  });

  it('allows a response with a Slack token but redacts it in safeText', () => {
    const result = safetyPostcheck(
      makeResponse({ text: 'The token is ' + 'xoxb-' + '111-222-abcdef' }),
    );
    expect(result.allow).toBe(true);
    expect(result.safeText).toContain('[SLACK_TOKEN]');
    expect(result.safeText).not.toContain('xoxb-');
  });

  it('allows a response with an API key but redacts it in safeText', () => {
    const result = safetyPostcheck(
      makeResponse({ text: 'Use sk-' + 'a'.repeat(25) + ' here.' }),
    );
    expect(result.allow).toBe(true);
    expect(result.safeText).toContain('[API_KEY]');
  });

  it('lists redactions in PolicyDecision.redactions when secrets are found', () => {
    const result = safetyPostcheck(
      makeResponse({ text: 'Token: ' + 'xoxb-' + '111-222-abcdef' }),
    );
    expect(result.allow).toBe(true);
    expect(result.redactions).toBeDefined();
    expect(result.redactions!.length).toBeGreaterThan(0);
    expect(result.redactions![0].kind).toBe('SLACK_TOKEN');
    expect(result.redactions![0].to).toBe('[SLACK_TOKEN]');
  });

  it('redactions array has correct from/to fields', () => {
    const token = 'xoxb-' + '111-222-abcdefghijk';
    const result = safetyPostcheck(makeResponse({ text: `Token: ${token}` }));
    const redaction = result.redactions?.find(r => r.kind === 'SLACK_TOKEN');
    expect(redaction).toBeDefined();
    expect(redaction!.from).toBe(token);
    expect(redaction!.to).toBe('[SLACK_TOKEN]');
  });

  it('redactions is undefined when no secrets are found', () => {
    const result = safetyPostcheck(makeResponse({ text: 'All clear here.' }));
    expect(result.redactions).toBeUndefined();
  });

  it('truncates response.text to 20000 chars and appends truncation marker', () => {
    const longText = 'x'.repeat(20001);
    const result = safetyPostcheck(makeResponse({ text: longText }));
    expect(result.allow).toBe(true);
    expect(result.safeText).toContain('[response truncated]');
    // safeText length should be 20000 + len('[response truncated]') = 20019
    expect(result.safeText.startsWith('x'.repeat(20000))).toBe(true);
    expect(result.safeText.endsWith('[response truncated]')).toBe(true);
  });

  it('does not truncate response.text at exactly 20000 chars', () => {
    const text = 'y'.repeat(20000);
    const result = safetyPostcheck(makeResponse({ text }));
    expect(result.allow).toBe(true);
    expect(result.safeText).toBe(text);
    expect(result.safeText).not.toContain('[response truncated]');
  });

  it('allows a normal response with tool trace', () => {
    const result = safetyPostcheck(
      makeResponse({
        text: 'I searched the web and found: the capital of France is Paris.',
        toolTrace: [{ tool: 'WebSearch', summary: 'searched for capital of France' }],
      }),
    );
    expect(result.allow).toBe(true);
    expect(result.safeText).toBe(
      'I searched the web and found: the capital of France is Paris.',
    );
  });

  it('redacts multiple secrets and lists all in redactions', () => {
    const text = 'Slack: ' + 'xoxb-' + '111-222-abc AWS: AKIAIOSFODNN7EXAMPLE';
    const result = safetyPostcheck(makeResponse({ text }));
    expect(result.allow).toBe(true);
    expect(result.redactions!.length).toBeGreaterThanOrEqual(2);
    const kinds = result.redactions!.map(r => r.kind);
    expect(kinds).toContain('SLACK_TOKEN');
    expect(kinds).toContain('AWS_ACCESS_KEY');
  });

  it('safeText still has redactions applied when response is long but within limit', () => {
    const token = 'xoxb-' + '999-888-secretxyz';
    const text = token + ' ' + 'a'.repeat(100);
    const result = safetyPostcheck(makeResponse({ text }));
    expect(result.safeText).toContain('[SLACK_TOKEN]');
    expect(result.safeText).not.toContain('xoxb-');
  });
});
