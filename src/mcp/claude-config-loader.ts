/**
 * ClaudeCodeMcpLoader
 *
 * Reads MCP server configurations from Claude Code's own config file (~/.claude.json)
 * and returns them in a format that can be passed directly to the Claude Agent SDK's
 * query() function.
 *
 * This lets Robin reuse all MCP connections Claude Code already has set up —
 * including Coralogix, GitHub, and any other servers — without needing separate
 * registration, without copying tokens into Robin's config, and without any
 * secrets in source code.
 *
 * Tokens stay in ~/.claude.json, managed by Claude Code. Robin reads them at
 * runtime and passes them through to the SDK subprocess environment.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

// ---------------------------------------------------------------------------
// Types that mirror what the Claude Agent SDK accepts for mcpServers
// ---------------------------------------------------------------------------

export interface StdioMcpServer {
  type: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface HttpMcpServer {
  type: 'http';
  url: string;
  headers?: Record<string, string>;
}

export interface StreamableHttpMcpServer {
  type: 'streamable-http';
  url: string;
  headers?: Record<string, string>;
}

export type NativeMcpServer = StdioMcpServer | HttpMcpServer | StreamableHttpMcpServer;

export type NativeMcpServers = Record<string, NativeMcpServer>;

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Reads ~/.claude.json and extracts mcpServers in SDK-native format.
 * Returns an empty object if the file is absent, unreadable, or has no servers.
 * Never throws.
 */
export function loadClaudeCodeMcpServers(): NativeMcpServers {
  const claudeJsonPath = path.join(os.homedir(), '.claude.json');
  try {
    const raw = fs.readFileSync(claudeJsonPath, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const raw_servers = parsed.mcpServers as Record<string, unknown> | undefined;
    if (!raw_servers || typeof raw_servers !== 'object') return {};

    const result: NativeMcpServers = {};

    for (const [name, cfg] of Object.entries(raw_servers)) {
      if (!cfg || typeof cfg !== 'object') continue;
      const server = cfg as Record<string, unknown>;

      // Stdio server: has a command field
      if (typeof server.command === 'string') {
        result[name] = {
          type: 'stdio',
          command: server.command,
          args: Array.isArray(server.args) ? server.args as string[] : undefined,
          env: isStringRecord(server.env) ? server.env : undefined,
        };
        continue;
      }

      // HTTP / streamable-http: has a url field
      if (typeof server.url === 'string') {
        const serverType = server.type === 'streamable-http' ? 'streamable-http' : 'http';
        result[name] = {
          type: serverType,
          url: server.url,
          headers: isStringRecord(server.headers) ? server.headers : undefined,
        };
        continue;
      }
    }

    return result;
  } catch {
    return {};
  }
}

function isStringRecord(v: unknown): v is Record<string, string> {
  return (
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    Object.values(v).every((x) => typeof x === 'string')
  );
}
