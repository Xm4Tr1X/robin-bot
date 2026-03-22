/**
 * AssistantService: wires prompt building → safety precheck → LLM runner →
 * safety postcheck → persona guard → memory writeback.
 *
 * This is the single path all non-command events flow through.
 *
 * Phase H: honours assistantMode per session.
 *   orchestrated  — full pipeline (default)
 *   claude-direct — minimal envelope; skips memory retrieval and prompt building;
 *                   safety gates still enforced end-to-end
 */
import { randomUUID } from 'node:crypto';
import type { IngressEvent, AssistantResponse, MemoryEntry, PromptEnvelope } from '../contracts';
import { buildPromptEnvelope, classifyTask } from '../prompting/prompt.builder';
import { safetyPrecheck } from '../policy/safety.precheck';
import { safetyPostcheck } from '../policy/safety.postcheck';
import { personaGuard } from '../policy/persona.guard';
import { MemoryService } from '../memory/memory.service';
import type { RunnerClient } from '../runtime/runner.client';
import { getSession, getAssistantMode } from '../session';
import type { MCPService } from '../features/mcp/mcp.service';
import { auditService } from '../audit/audit.service';
import { activityBus } from '../display/activity.bus';
import { classifyRisk } from '../policy/risk.classifier';
import type { RiskLevel } from '../policy/risk.classifier';
import { loadClaudeCodeMcpServers } from '../mcp/claude-config-loader';
import type { NativeMcpServers } from '../mcp/claude-config-loader';
import { ledgerHolder } from '../todo';
import { extractTodoCommands, executeTodoCommands } from '../features/todos/todo.executor';
import { selectModel } from '../runtime/model.selector';
import { getRunnerClient } from '../runtime/runner.factory';

export interface AssistantServiceConfig {
  allowedTools: string[];
  timeoutMs?: number;
  memoryService: MemoryService;
  runnerClient: RunnerClient;
  /** Risk-level-based tool allowlists. When set, overrides allowedTools per request. */
  toolPolicy?: Record<RiskLevel, string[]>;
  /** Model routing config from robin.json — enables multi-model orchestration. */
  modelRouting?: { enabled: boolean; defaultModel?: string; reasoningModel?: string; actionModel?: string; reviewerModel?: string } | null;
  /** Fireworks API key for open source model routing. */
  fireworksApiKey?: string;
  /**
   * When provided, enabled MCP connections are mounted as HTTP tool providers
   * on every agent turn. The set is resolved live so newly-enabled connections
   * take effect without restarting the service.
   */
  mcpService?: MCPService;
}

const DEFAULT_TIMEOUT_MS = 60_000;

export class AssistantService {
  private config: AssistantServiceConfig;
  private claudeMcpServers: NativeMcpServers;

  constructor(config: AssistantServiceConfig) {
    this.config = config;
    // Load Claude Code MCP servers once at startup.
    // Tokens come from ~/.claude.json at runtime — nothing stored in Robin's config.
    this.claudeMcpServers = loadClaudeCodeMcpServers();
    const count = Object.keys(this.claudeMcpServers).length;
    if (count > 0) {
      console.log(`[robin] mcp: loaded ${count} server(s) from ~/.claude.json: ${Object.keys(this.claudeMcpServers).join(', ')}`);
    }
  }

  async handle(event: IngressEvent): Promise<AssistantResponse> {
    const requestId = randomUUID();
    const { conversationId } = event;
    const [channelId, threadId] = conversationId.split(':');
    const session = getSession(channelId, threadId);
    const assistantMode = getAssistantMode(channelId, threadId);

    // ------------------------------------------------------------------
    // 1. Classify risk + task, select model — done before envelope build
    //    so effectiveTools (which adds Agent for Claude) is available.
    // ------------------------------------------------------------------

    const riskLevel = classifyRisk(event.text);
    const resolvedTools = this.config.toolPolicy
      ? (this.config.toolPolicy[riskLevel] ?? this.config.allowedTools)
      : this.config.allowedTools;

    const taskClass = assistantMode === 'claude-direct' ? 'general' : classifyTask(event.text);

    // Include thread messages as additional routing context so "check this"
    // in a Coralogix alert thread routes to Sonnet, not kimi/glm
    const threadContextForRouting = Array.isArray(event.metadata?.threadMessages)
      ? (event.metadata.threadMessages as string[]).join(' ')
      : undefined;

    const modelSelection = selectModel(
      taskClass,
      riskLevel,
      event.text,
      this.config.modelRouting?.enabled ? this.config.modelRouting : null,
      threadContextForRouting,
    );
    const activeRunner = this.config.modelRouting?.enabled
      ? getRunnerClient(modelSelection, { fireworksApiKey: this.config.fireworksApiKey })
      : this.config.runnerClient;

    // Agent tool only on Claude path when routing is active.
    // Disabled when modelRouting is off (preserves test behaviour with injected runner).
    const effectiveTools = (this.config.modelRouting?.enabled && modelSelection.provider === 'claude' && !resolvedTools.includes('Agent'))
      ? [...resolvedTools, 'Agent']
      : resolvedTools;

    // ------------------------------------------------------------------
    // 2. Build prompt envelope
    // ------------------------------------------------------------------

    let envelope: PromptEnvelope;

    if (assistantMode === 'claude-direct') {
      envelope = {
        taskClass: 'general',
        persona: 'assistant',
        policyConstraints: [],
        memoryContext: [],
        channelContext: [],
        allowedTools: effectiveTools,
        responseContract: { format: 'plain', allowExternalLinks: false },
        userInput: event.text,
      };
    } else {
      const memoryEntries: MemoryEntry[] = this.config.memoryService.getForConversation(conversationId);
      const globalEntries = this.config.memoryService.getGlobal();
      // Inject todos when: request is clearly todo-related, OR ledger has items and request
      // is short/ambiguous (e.g. "taza tindi" with no keywords — Kimi/GLM need the list to act).
      const isTodoRelated = /\btodos?|tasks?|done|progress|blocked|unblocked|mark|rename|change|update|add .*(todo|task)|tomorrow|today\b/i.test(event.text);
      const hasActiveTodos = ledgerHolder.instance.serialize().filter(t => t.status !== 'done').length > 0;
      const todoContext = (isTodoRelated || hasActiveTodos) ? ledgerHolder.instance.formatForSlack() : undefined;
      // Thread context from Slack (fetched by adapter when mention is in a thread)
      const threadContext = Array.isArray(event.metadata?.threadMessages)
        ? event.metadata.threadMessages as string[]
        : undefined;

      envelope = buildPromptEnvelope({
        event,
        memoryEntries,
        sessionMode: session.mode,
        allowedTools: effectiveTools,
        globalEntries,
        todoContext,
        threadContext,
      });
    }

    // 3. Safety precheck — fail closed
    const precheck = safetyPrecheck(envelope);
    if (!precheck.allow) {
      console.warn(`[robin] safety.precheck blocked requestId=${requestId} reason=${precheck.reason}`);
      return {
        requestId,
        conversationId,
        text: `_Request blocked by safety check: ${precheck.reason}_`,
        isDraft: false,
        toolTrace: [],
      };
    }

    // 4. Notify display layer (model label + spinner) then run.
    // source/channel/threadId let startSlack() post an immediate "Checking…" ack.
    activityBus.emit({
      kind: 'runner_start',
      source: event.source,
      channel: event.channelId,
      threadId: event.threadId,
      model: modelSelection.model,
      provider: modelSelection.provider,
      displayName: modelSelection.displayName,
    });

    // MCP connections — only available on Claude path
    const mcpServers = modelSelection.provider === 'claude'
      ? this.config.mcpService?.getEnabledConnections().map(c => ({ name: c.name, endpoint: c.endpoint }))
      : undefined;

    const runnerStartMs = Date.now();
    let runnerResponse;
    try {
      runnerResponse = await activeRunner.run({
        requestId,
        sessionId: session.agentSessionId,
        envelope,
        timeoutMs: this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        mcpServers: mcpServers?.length ? mcpServers : undefined,
        nativeMcpServers: Object.keys(this.claudeMcpServers).length > 0
          ? this.claudeMcpServers as Record<string, unknown>
          : undefined,
      });
      auditService.emit({
        event_type: 'runner.telemetry',
        actor_id: event.actorId,
        correlation_id: requestId,
        outcome: 'allowed',
        metadata: {
          latencyMs: Date.now() - runnerStartMs,
          inputTokens: runnerResponse.usage?.inputTokens,
          outputTokens: runnerResponse.usage?.outputTokens,
          costUsd: runnerResponse.usage?.costUsd,
        },
      });
    } catch (err) {
      auditService.emit({
        event_type: 'runner.telemetry',
        actor_id: event.actorId,
        correlation_id: requestId,
        outcome: 'blocked',
        metadata: { latencyMs: Date.now() - runnerStartMs },
      });
      console.error(`[robin] runner error requestId=${requestId}`, err);
      return {
        requestId,
        conversationId,
        text: '_Assistant unavailable. Please try again._',
        isDraft: false,
        toolTrace: [],
      };
    }

    // Persist session ID for conversation continuity
    session.agentSessionId = runnerResponse.sessionId;

    // 5. Safety postcheck + redaction — fail closed
    const postcheck = safetyPostcheck(runnerResponse);
    if (!postcheck.allow) {
      console.warn(`[robin] safety.postcheck blocked requestId=${requestId} reason=${postcheck.reason}`);
      // Empty response usually means the agent hit maxTurns mid-investigation
      const fallback = postcheck.reason === 'empty response'
        ? '_Investigation ran out of turns before producing a summary. Try: "summarize what you found" to continue._'
        : '_Response blocked by safety check. Please try a different request._';
      return {
        requestId,
        conversationId,
        text: fallback,
        isDraft: false,
        toolTrace: runnerResponse.toolTrace,
      };
    }

    // 6. Persona compliance guard — fail closed
    const persona = personaGuard(postcheck.safeText);
    if (!persona.allow) {
      console.warn(`[robin] persona.guard blocked requestId=${requestId} reason=${persona.reason}`);
      return {
        requestId,
        conversationId,
        text: '_Response did not pass compliance check. Please try rephrasing._',
        isDraft: false,
        toolTrace: runnerResponse.toolTrace,
      };
    }

    const isDraft = session.mode === 'draft';
    let finalText = isDraft
      ? `*Draft — reply "approve" to post or edit as needed:*\n\`\`\`\n${postcheck.safeText}\n\`\`\``
      : postcheck.safeText;

    // Auto-execute todo commands suggested by the LLM on trusted sources (CLI, system).
    // CLI is fully trusted — no need to make the user copy-paste commands Robin itself suggested.
    if (event.source === 'cli' || event.source === 'system') {
      const commands = extractTodoCommands(postcheck.safeText);
      if (commands.length > 0) {
        const result = executeTodoCommands(commands);
        if (result.executed.length > 0) {
          const summary = result.executed.map(e => `• ${e}`).join('\n');
          finalText = `${finalText}\n\n_Done — executed automatically:_\n${summary}`;
        }
      }
    }

    return {
      requestId,
      conversationId,
      text: finalText,
      isDraft,
      toolTrace: runnerResponse.toolTrace,
    };
  }
}
