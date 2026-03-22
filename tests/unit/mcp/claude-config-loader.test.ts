/**
 * Tests for the Claude Code MCP config loader.
 * Verifies that HTTP server entries are synthesised from stdio servers
 * so the Agent SDK can reliably use them.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';

vi.mock('fs');

function mockClaudeJson(mcpServers: Record<string, unknown>) {
  vi.mocked(fs.readFileSync).mockReturnValue(
    JSON.stringify({ mcpServers }),
  );
}

describe('loadClaudeCodeMcpServers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mocked(fs.readFileSync).mockReturnValue('{}');
  });

  it('returns empty object when ~/.claude.json has no mcpServers', async () => {
    mockClaudeJson({});
    const { loadClaudeCodeMcpServers } = await import('../../../src/mcp/claude-config-loader.js');
    expect(loadClaudeCodeMcpServers()).toEqual({});
  });

  it('loads a stdio server correctly', async () => {
    mockClaudeJson({
      github: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'], env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_test' } },
    });
    const { loadClaudeCodeMcpServers } = await import('../../../src/mcp/claude-config-loader.js');
    const servers = loadClaudeCodeMcpServers();
    expect(servers.github.type).toBe('stdio');
  });

  it('synthesises coralogix-http HTTP entry when coralogix-mcp stdio is present', async () => {
    mockClaudeJson({
      'coralogix-mcp': {
        command: 'npx',
        args: ['coralogix-mcp'],
        env: { CORALOGIX_API_KEY: 'cxtp_testkey', CORALOGIX_DOMAIN: 'coralogix.in' },
      },
    });
    const { loadClaudeCodeMcpServers } = await import('../../../src/mcp/claude-config-loader.js');
    const servers = loadClaudeCodeMcpServers();

    // Original stdio entry preserved
    expect(servers['coralogix-mcp']).toBeDefined();
    expect(servers['coralogix-mcp'].type).toBe('stdio');

    // Synthetic HTTP entry added
    expect(servers['coralogix-http']).toBeDefined();
    const http = servers['coralogix-http'] as { type: string; url: string; headers?: Record<string, string> };
    expect(http.type).toBe('http');
    expect(http.url).toBe('https://api.coralogix.in/mgmt/api/v1/mcp');
    expect(http.headers?.Authorization).toBe('Bearer cxtp_testkey');
  });

  it('uses default domain coralogix.com when CORALOGIX_DOMAIN is absent', async () => {
    mockClaudeJson({
      'coralogix-mcp': {
        command: 'npx',
        args: ['coralogix-mcp'],
        env: { CORALOGIX_API_KEY: 'cxtp_testkey' },
      },
    });
    const { loadClaudeCodeMcpServers } = await import('../../../src/mcp/claude-config-loader.js');
    const servers = loadClaudeCodeMcpServers();
    const http = servers['coralogix-http'] as { url: string };
    expect(http.url).toBe('https://api.coralogix.com/mgmt/api/v1/mcp');
  });

  it('does NOT synthesise coralogix-http when CORALOGIX_API_KEY is missing', async () => {
    mockClaudeJson({
      'coralogix-mcp': { command: 'npx', args: ['coralogix-mcp'] },
    });
    const { loadClaudeCodeMcpServers } = await import('../../../src/mcp/claude-config-loader.js');
    const servers = loadClaudeCodeMcpServers();
    expect(servers['coralogix-http']).toBeUndefined();
  });

  it('returns empty object on file read error', async () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('not found'); });
    const { loadClaudeCodeMcpServers } = await import('../../../src/mcp/claude-config-loader.js');
    expect(loadClaudeCodeMcpServers()).toEqual({});
  });
});
