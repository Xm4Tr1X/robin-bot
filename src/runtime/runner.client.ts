/**
 * RunnerClient: wraps the Claude Agent SDK for in-process LLM execution.
 *
 * Safety note: permissionMode is 'bypassPermissions' because Robin policy gates
 * are the hard enforcement layer. All safety/policy checks MUST run before and
 * after this client is called.
 */
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { RunnerRequest, RunnerResponse } from '../contracts';
import { envelopeToPromptString } from '../prompting/prompt.contract';
import { activityBus } from '../display/activity.bus';

// Required to allow Claude Code subprocess even when launched from within a
// Claude Code session (development mode). No-op in production.
delete process.env.CLAUDECODE;

export interface RunnerClient {
  run(request: RunnerRequest): Promise<RunnerResponse>;
}

export class AgentSdkRunnerClient implements RunnerClient {
  async run(request: RunnerRequest): Promise<RunnerResponse> {
    const { requestId, sessionId, envelope, timeoutMs } = request;

    const prompt = envelopeToPromptString(envelope);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const options: Record<string, any> = {
      maxTurns: 30,
      permissionMode: 'bypassPermissions',
      timeout: timeoutMs,
    };

    if (sessionId) {
      options.resume = sessionId;
    } else {
      options.systemPrompt = envelope.persona;
      options.allowedTools = envelope.allowedTools;
    }

    // Mount MCP connections for this agent turn.
    // Two sources are merged:
    //   1. Robin's own HTTP-only MCP registry (mcp add/validate/test/enable)
    //   2. nativeMcpServers — pre-formatted configs from ~/.claude.json (stdio + http + streamable-http)
    // Applied on every turn so newly-enabled connections take effect without restart.
    const robinHttpServers = request.mcpServers && request.mcpServers.length > 0
      ? Object.fromEntries(
          request.mcpServers.map(s => [s.name, { type: 'http' as const, url: s.endpoint }]),
        )
      : {};
    const nativeServers = request.nativeMcpServers ?? {};
    const mergedServers = { ...nativeServers, ...robinHttpServers };
    if (Object.keys(mergedServers).length > 0) {
      options.mcpServers = mergedServers;
    }

    let capturedSessionId = sessionId ?? '';
    let responseText = '';
    const toolTrace: RunnerResponse['toolTrace'] = [];
    const runnerStartMs = Date.now();

    for await (const message of query({ prompt, options })) {
      if ('subtype' in message && message.subtype === 'init') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        capturedSessionId = (message as any).session_id ?? capturedSessionId;
      }
      if ('result' in message && typeof message.result === 'string') {
        responseText = message.result;
      }
      // Capture tool use summary and emit to activity bus for live CLI display
      if ('type' in message && message.type === 'assistant' && 'message' in message) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const msg = message as any;
        if (Array.isArray(msg.message?.content)) {
          for (const block of msg.message.content) {
            if (block.type === 'tool_use') {
              const summary = JSON.stringify(block.input).slice(0, 200);
              toolTrace.push({ tool: block.name, summary });
              activityBus.emit({
                kind: 'tool_call',
                tool: block.name,
                toolInput: summary,
              });
            }
          }
        }
      }
    }

    activityBus.emit({
      kind: 'completing',
      durationMs: Date.now() - runnerStartMs,
    });

    return {
      requestId,
      sessionId: capturedSessionId,
      text: responseText,
      toolTrace,
    };
  }
}
