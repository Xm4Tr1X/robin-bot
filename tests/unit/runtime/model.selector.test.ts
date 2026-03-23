/**
 * Model selector tests — verifies routing decisions including glm5 removal.
 */

import { describe, it, expect } from 'vitest';
import { selectModel, KIMI_MODEL, CLAUDE_HAIKU } from '../../../src/runtime/model.selector.js';

const routing = {
  enabled: true,
  defaultModel: 'claude-sonnet-4-6',
  reasoningModel: 'claude-opus-4-6',
  actionModel: KIMI_MODEL,
  // No reviewerModel — glm5 removed
};

describe('Model selector — glm5 removed', () => {
  it('DEEP_SIGNALS (explain why) no longer routes to fireworks', () => {
    const sel = selectModel('general', 'low', 'explain why microservices are hard', routing);
    expect(sel.provider).not.toBe('fireworks');
  });

  it('DEEP_SIGNALS (think through) routes to Claude Haiku', () => {
    const sel = selectModel('general', 'medium', 'think through the architecture for X', routing);
    expect(sel.provider).toBe('claude');
    expect(sel.model).toContain('haiku');
  });

  it('DEEP_SIGNALS (explain why) routes to Claude Haiku', () => {
    const sel = selectModel('general', 'low', 'explain why microservices increase complexity', routing);
    expect(sel.provider).toBe('claude');
    expect(sel.model).toContain('haiku');
  });

  it('todo updates still route to kimi', () => {
    const sel = selectModel('todo', 'low', 'repos are unblocked its done', routing);
    expect(sel.provider).toBe('fireworks');
    expect(sel.model).toBe(KIMI_MODEL);
  });

  it('kimi user override still works', () => {
    const sel = selectModel('general', 'low', 'use kimi: summarize this', routing);
    expect(sel.provider).toBe('fireworks');
    expect(sel.userOverride).toBe(true);
  });

  it('use glm override no longer exists — falls through to default routing', () => {
    // "use glm" should no longer override — treated as plain text
    const sel = selectModel('general', 'low', 'use glm: explain this', routing);
    // Should NOT be fireworks/glm (override removed)
    expect(sel.model).not.toContain('glm');
  });

  it('MCP tasks still route to Claude Sonnet', () => {
    const sel = selectModel('alert', 'medium', 'check coralogix logs', routing);
    expect(sel.provider).toBe('claude');
    expect(sel.model).toContain('sonnet');
  });

  it('routing disabled falls back to Claude Sonnet', () => {
    const sel = selectModel('general', 'low', 'anything', null);
    expect(sel.provider).toBe('claude');
  });
});
