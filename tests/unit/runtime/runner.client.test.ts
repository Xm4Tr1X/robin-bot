/**
 * Unit tests for AgentSdkRunnerClient.
 *
 * Mocks @anthropic-ai/claude-agent-sdk so no real Claude agent is started.
 * Verifies that RunnerRequest fields are correctly translated to SDK options,
 * with emphasis on Phase J: MCP server mounting.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: mockQuery }));

import { AgentSdkRunnerClient } from '../../../src/runtime/runner.client.js';
import type { RunnerRequest } from '../../../src/contracts.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(overrides: Partial<RunnerRequest> = {}): RunnerRequest {
  return {
    requestId: 'R_TEST',
    envelope: {
      taskClass: 'general',
      persona: 'Test assistant',
      policyConstraints: [],
      memoryContext: [],
      channelContext: [],
      allowedTools: ['Read'],
      responseContract: { format: 'plain', allowExternalLinks: false },
      userInput: 'hello',
    },
    timeoutMs: 5000,
    ...overrides,
  };
}

function mockQueryYielding(messages: unknown[]) {
  mockQuery.mockReturnValue(
    (async function* () {
      for (const m of messages) yield m;
    })(),
  );
}

function lastCallOptions(): Record<string, unknown> {
  const arg = mockQuery.mock.calls.at(-1)?.[0] as { options: Record<string, unknown> };
  return arg.options;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentSdkRunnerClient', () => {
  let client: AgentSdkRunnerClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new AgentSdkRunnerClient();
  });

  // -------------------------------------------------------------------------
  // Basic response parsing
  // -------------------------------------------------------------------------

  it('returns the result text from the query stream', async () => {
    mockQueryYielding([{ result: 'Hello there!' }]);
    const resp = await client.run(makeRequest());
    expect(resp.text).toBe('Hello there!');
    expect(resp.requestId).toBe('R_TEST');
  });

  it('captures tool_use blocks into toolTrace', async () => {
    mockQueryYielding([
      {
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/tmp/foo' } }],
        },
      },
      { result: 'done' },
    ]);
    const resp = await client.run(makeRequest());
    expect(resp.toolTrace).toHaveLength(1);
    expect(resp.toolTrace[0].tool).toBe('Read');
  });

  it('uses permissionMode=bypassPermissions', async () => {
    mockQueryYielding([{ result: 'ok' }]);
    await client.run(makeRequest());
    expect(lastCallOptions().permissionMode).toBe('bypassPermissions');
  });

  it('sets systemPrompt and allowedTools on a new session', async () => {
    mockQueryYielding([{ result: 'ok' }]);
    await client.run(makeRequest());
    const opts = lastCallOptions();
    expect(opts.systemPrompt).toBe('Test assistant');
    expect(opts.allowedTools).toEqual(['Read']);
    expect(opts.resume).toBeUndefined();
  });

  it('sets resume instead of systemPrompt when sessionId is provided', async () => {
    mockQueryYielding([{ result: 'ok' }]);
    await client.run(makeRequest({ sessionId: 'SESS_EXISTING' }));
    const opts = lastCallOptions();
    expect(opts.resume).toBe('SESS_EXISTING');
    expect(opts.systemPrompt).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Phase J: MCP server mounting
  // -------------------------------------------------------------------------

  describe('MCP server mounting', () => {
    it('translates mcpServers into HTTP McpServerConfig records', async () => {
      mockQueryYielding([{ result: 'ok' }]);
      await client.run(
        makeRequest({
          mcpServers: [
            { name: 'GitHub', endpoint: 'https://api.github.com/mcp' },
            { name: 'Slack', endpoint: 'https://slack.example.com/mcp' },
          ],
        }),
      );
      expect(lastCallOptions().mcpServers).toEqual({
        GitHub: { type: 'http', url: 'https://api.github.com/mcp' },
        Slack: { type: 'http', url: 'https://slack.example.com/mcp' },
      });
    });

    it('mounts MCP servers even on a resumed session', async () => {
      mockQueryYielding([{ result: 'ok' }]);
      await client.run(
        makeRequest({
          sessionId: 'SESS_RESUMED',
          mcpServers: [{ name: 'GitHub', endpoint: 'https://api.github.com/mcp' }],
        }),
      );
      const opts = lastCallOptions();
      expect(opts.resume).toBe('SESS_RESUMED');
      expect(opts.mcpServers).toEqual({
        GitHub: { type: 'http', url: 'https://api.github.com/mcp' },
      });
    });

    it('omits mcpServers from options when request has none', async () => {
      mockQueryYielding([{ result: 'ok' }]);
      await client.run(makeRequest());
      expect(lastCallOptions().mcpServers).toBeUndefined();
    });

    it('omits mcpServers from options when the array is empty', async () => {
      mockQueryYielding([{ result: 'ok' }]);
      await client.run(makeRequest({ mcpServers: [] }));
      expect(lastCallOptions().mcpServers).toBeUndefined();
    });
  });
});
