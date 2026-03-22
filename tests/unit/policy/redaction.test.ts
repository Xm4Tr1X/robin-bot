import { describe, it, expect } from 'vitest';
import { redactSecrets, containsSecrets } from '../../../src/policy/redaction.js';

// ---------------------------------------------------------------------------
// redactSecrets
// ---------------------------------------------------------------------------

describe('redactSecrets', () => {
  it('passes clean text through unchanged', () => {
    const text = 'Hello, this is a clean message with no secrets.';
    const result = redactSecrets(text);
    expect(result.redacted).toBe(text);
    expect(result.found).toHaveLength(0);
  });

  it('redacts a Slack bot token (xoxb)', () => {
    const text = 'My token is ' + 'xoxb-' + '123456789012-1234567890123-abcdefghijklmnopqrstuvwx';
    const result = redactSecrets(text);
    expect(result.redacted).toContain('[SLACK_TOKEN]');
    expect(result.redacted).not.toContain('xoxb-');
    expect(result.found).toHaveLength(1);
    expect(result.found[0].kind).toBe('SLACK_TOKEN');
    expect(result.found[0].replacement).toBe('[SLACK_TOKEN]');
    expect(result.found[0].original).toContain('xoxb-');
  });

  it('redacts a Slack app token (xoxa)', () => {
    const text = 'Token: xoxa-2-abcdef123456';
    const result = redactSecrets(text);
    expect(result.redacted).toContain('[SLACK_TOKEN]');
    expect(result.found[0].kind).toBe('SLACK_TOKEN');
  });

  it('redacts a Slack user token (xoxp)', () => {
    const text = 'User token: ' + 'xoxp-' + '999-888-777-abcdefabcdef';
    const result = redactSecrets(text);
    expect(result.redacted).toContain('[SLACK_TOKEN]');
  });

  it('redacts a Bearer token', () => {
    const text = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.def';
    const result = redactSecrets(text);
    expect(result.redacted).toContain('[BEARER_TOKEN]');
    expect(result.redacted).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    expect(result.found[0].kind).toBe('BEARER_TOKEN');
    expect(result.found[0].replacement).toBe('[BEARER_TOKEN]');
  });

  it('redacts Bearer token case-insensitively', () => {
    const text = 'BEARER sometoken123';
    const result = redactSecrets(text);
    expect(result.redacted).toContain('[BEARER_TOKEN]');
  });

  it('redacts an OpenAI/Anthropic API key (sk-...)', () => {
    const text = 'Use this key: sk-abcdefghijklmnopqrstuvwxyz1234567890ABCD';
    const result = redactSecrets(text);
    expect(result.redacted).toContain('[API_KEY]');
    expect(result.redacted).not.toContain('sk-abcdef');
    expect(result.found[0].kind).toBe('API_KEY');
    expect(result.found[0].replacement).toBe('[API_KEY]');
  });

  it('does not redact sk- with fewer than 20 chars after prefix', () => {
    const text = 'prefix sk-tooshort suffix';
    const result = redactSecrets(text);
    expect(result.redacted).toBe(text);
    expect(result.found).toHaveLength(0);
  });

  it('redacts an AWS access key (AKIA...)', () => {
    const text = 'AWS key: AKIAIOSFODNN7EXAMPLE';
    const result = redactSecrets(text);
    expect(result.redacted).toContain('[AWS_ACCESS_KEY]');
    expect(result.redacted).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(result.found[0].kind).toBe('AWS_ACCESS_KEY');
    expect(result.found[0].replacement).toBe('[AWS_ACCESS_KEY]');
  });

  it('redacts a private key header (RSA)', () => {
    const text = 'Key: -----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...';
    const result = redactSecrets(text);
    expect(result.redacted).toContain('[PRIVATE_KEY]');
    expect(result.redacted).not.toContain('-----BEGIN RSA PRIVATE KEY-----');
    expect(result.found[0].kind).toBe('PRIVATE_KEY');
    expect(result.found[0].replacement).toBe('[PRIVATE_KEY]');
  });

  it('redacts a private key header (EC)', () => {
    const text = '-----BEGIN EC PRIVATE KEY-----';
    const result = redactSecrets(text);
    expect(result.redacted).toContain('[PRIVATE_KEY]');
  });

  it('redacts a private key header (OPENSSH)', () => {
    const text = '-----BEGIN OPENSSH PRIVATE KEY-----';
    const result = redactSecrets(text);
    expect(result.redacted).toContain('[PRIVATE_KEY]');
  });

  it('redacts a generic private key header (no prefix)', () => {
    const text = '-----BEGIN PRIVATE KEY-----';
    const result = redactSecrets(text);
    expect(result.redacted).toContain('[PRIVATE_KEY]');
  });

  it('redacts token assignment (token: value)', () => {
    const text = 'config token: mysupersecrettoken123';
    const result = redactSecrets(text);
    expect(result.redacted).toContain('[REDACTED_SECRET]');
    expect(result.found[0].kind).toBe('REDACTED_SECRET');
    expect(result.found[0].replacement).toBe('[REDACTED_SECRET]');
  });

  it('redacts password assignment (password = value)', () => {
    const text = "password = 'myP@ssw0rd!!'";
    const result = redactSecrets(text);
    expect(result.redacted).toContain('[REDACTED_SECRET]');
  });

  it('redacts secret assignment (secret: value)', () => {
    const text = 'secret: abc123XYZ!@#$%^&*';
    const result = redactSecrets(text);
    expect(result.redacted).toContain('[REDACTED_SECRET]');
  });

  it('redacts api_key assignment', () => {
    const text = 'api_key = myApiKey12345';
    const result = redactSecrets(text);
    expect(result.redacted).toContain('[REDACTED_SECRET]');
  });

  it('redacts apikey assignment', () => {
    const text = 'apikey: myApiKeyValue123';
    const result = redactSecrets(text);
    expect(result.redacted).toContain('[REDACTED_SECRET]');
  });

  it('does not redact generic assignment with value shorter than 8 chars', () => {
    const text = 'token: short';
    const result = redactSecrets(text);
    // 'short' is 5 chars, below threshold — should not be redacted
    expect(result.found.filter(f => f.kind === 'REDACTED_SECRET')).toHaveLength(0);
  });

  it('redacts multiple secrets in one string', () => {
    const text = [
      'slack token ' + 'xoxb-' + '111-222-abc',
      'and api key sk-aaaaaaaaaaaaaaaaaaaaaaaaa',
      'and AWS AKIAIOSFODNN7EXAMPLE',
    ].join(' ');
    const result = redactSecrets(text);
    expect(result.redacted).toContain('[SLACK_TOKEN]');
    expect(result.redacted).toContain('[API_KEY]');
    expect(result.redacted).toContain('[AWS_ACCESS_KEY]');
    expect(result.found.length).toBeGreaterThanOrEqual(3);
  });

  it('records original values in found array', () => {
    const slackToken = 'xoxb-' + '111-222-abcdefghijk';
    const text = `Token: ${slackToken}`;
    const result = redactSecrets(text);
    expect(result.found[0].original).toBe(slackToken);
  });

  it('replacement placeholders have correct values', () => {
    const cases: Array<{ text: string; kind: string; placeholder: string }> = [
      { text: 'xoxb-' + '111-222-abc', kind: 'SLACK_TOKEN', placeholder: '[SLACK_TOKEN]' },
      { text: 'Bearer sometoken123abc', kind: 'BEARER_TOKEN', placeholder: '[BEARER_TOKEN]' },
      { text: 'sk-' + 'a'.repeat(20), kind: 'API_KEY', placeholder: '[API_KEY]' },
      { text: 'AKIAIOSFODNN7EXAMPLE', kind: 'AWS_ACCESS_KEY', placeholder: '[AWS_ACCESS_KEY]' },
      { text: '-----BEGIN PRIVATE KEY-----', kind: 'PRIVATE_KEY', placeholder: '[PRIVATE_KEY]' },
      { text: 'token: mysecretvalue123', kind: 'REDACTED_SECRET', placeholder: '[REDACTED_SECRET]' },
    ];

    for (const { text, kind, placeholder } of cases) {
      const result = redactSecrets(text);
      const match = result.found.find(f => f.kind === kind);
      expect(match, `expected to find kind=${kind} in: ${text}`).toBeDefined();
      expect(match?.replacement).toBe(placeholder);
    }
  });
});

// ---------------------------------------------------------------------------
// containsSecrets
// ---------------------------------------------------------------------------

describe('containsSecrets', () => {
  it('returns false for clean text', () => {
    expect(containsSecrets('Hello, world!')).toBe(false);
  });

  it('returns true for text with a Slack token', () => {
    expect(containsSecrets('token ' + 'xoxb-' + '111-222-abc')).toBe(true);
  });

  it('returns true for text with a Bearer token', () => {
    expect(containsSecrets('Bearer sometoken123')).toBe(true);
  });

  it('returns true for text with an API key', () => {
    expect(containsSecrets('sk-' + 'x'.repeat(20))).toBe(true);
  });

  it('returns true for text with an AWS access key', () => {
    expect(containsSecrets('AKIAIOSFODNN7EXAMPLE')).toBe(true);
  });

  it('returns true for text with a private key header', () => {
    expect(containsSecrets('-----BEGIN PRIVATE KEY-----')).toBe(true);
  });

  it('returns true for text with a generic secret assignment', () => {
    expect(containsSecrets('password = supersecret123')).toBe(true);
  });

  it('returns false for normal assignment with short value', () => {
    expect(containsSecrets('token: hi')).toBe(false);
  });

  it('returns true when any one of many secrets is present', () => {
    expect(containsSecrets('nothing special here AKIAIOSFODNN7EXAMPLE end')).toBe(true);
  });
});
