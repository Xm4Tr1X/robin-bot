/**
 * Robin LLM capability test suite.
 *
 * Tests all layers:
 *   1. Routing table     — pure logic, no API calls
 *   2. Permission gates  — access policy, safety precheck, risk classification
 *   3. Fireworks live    — real API calls to kimi2.5 and glm5
 *   4. Claude live       — real API calls via Anthropic Messages API
 *   5. MCP registry      — verifies ~/.claude.json servers are loadable
 *
 * Usage:
 *   npx tsx scripts/test-llm.ts              # run all
 *   npx tsx scripts/test-llm.ts --routing    # routing table only (instant)
 *   npx tsx scripts/test-llm.ts --perms      # permission gates only (instant)
 *   npx tsx scripts/test-llm.ts --fireworks  # fireworks live calls
 *   npx tsx scripts/test-llm.ts --claude     # claude live calls
 *   npx tsx scripts/test-llm.ts --mcp        # mcp registry check
 */

import Anthropic from '@anthropic-ai/sdk';
import { AnthropicVertex } from '@anthropic-ai/vertex-sdk';
import { selectModel, KIMI_MODEL, GLM_MODEL } from '../src/runtime/model.selector';
import { checkAccess } from '../src/policy/access.policy';
import { safetyPrecheck } from '../src/policy/safety.precheck';
import { classifyRisk } from '../src/policy/risk.classifier';
import { loadClaudeCodeMcpServers } from '../src/mcp/claude-config-loader';
import type { AccessContext, PromptEnvelope } from '../src/contracts';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// ---------------------------------------------------------------------------
// ANSI helpers
// ---------------------------------------------------------------------------
const DIM    = (s: string) => `\x1b[2m${s}\x1b[0m`;
const GREEN  = (s: string) => `\x1b[32m${s}\x1b[0m`;
const RED    = (s: string) => `\x1b[31m${s}\x1b[0m`;
const YELLOW = (s: string) => `\x1b[33m${s}\x1b[0m`;
const CYAN   = (s: string) => `\x1b[36m${s}\x1b[0m`;
const BOLD   = (s: string) => `\x1b[1m${s}\x1b[0m`;
const PASS = GREEN('✓');
const FAIL = RED('✗');
const SKIP = YELLOW('○');

const routing = {
  enabled: true,
  defaultModel:   'claude-sonnet-4-6',
  reasoningModel: 'claude-opus-4-6',
  actionModel:    KIMI_MODEL,
  reviewerModel:  GLM_MODEL,
};

const args = process.argv.slice(2);
const runAll       = args.length === 0;
const runRouting   = runAll || args.includes('--routing');
const runPerms     = runAll || args.includes('--perms');
const runFireworks = runAll || args.includes('--fireworks');
const runClaude    = runAll || args.includes('--claude');
const runMcp       = runAll || args.includes('--mcp');

// ---------------------------------------------------------------------------
// 1. Routing table
// ---------------------------------------------------------------------------
function testRouting(): boolean {
  console.log('\n' + BOLD('═══ 1. Routing Table ═══'));

  const cases: Array<{
    label: string;
    taskClass: Parameters<typeof selectModel>[0];
    risk: Parameters<typeof selectModel>[1];
    text: string;
    expectProvider: 'fireworks' | 'claude';
    expectModel: string;
  }> = [
    // Fireworks — kimi2.5
    { label: 'todo update (unblocked)',      taskClass: 'todo',    risk: 'low',    text: 'repos are unblocked its done',         expectProvider: 'fireworks', expectModel: 'kimi' },
    { label: 'todo rename',                  taskClass: 'todo',    risk: 'low',    text: 'rename task X to Y',                   expectProvider: 'fireworks', expectModel: 'kimi' },
    { label: 'quick factual Q&A',            taskClass: 'general', risk: 'low',    text: 'what is 2+2',                          expectProvider: 'fireworks', expectModel: 'kimi' },
    { label: 'summarize week',               taskClass: 'general', risk: 'low',    text: 'summarize what happened last week',     expectProvider: 'fireworks', expectModel: 'kimi' },
    // Fireworks — glm5
    { label: 'explain why (analytical)',     taskClass: 'general', risk: 'low',    text: 'explain why microservices are hard',    expectProvider: 'fireworks', expectModel: 'glm' },
    { label: 'think through arch',           taskClass: 'general', risk: 'medium', text: 'think through the architecture for X',  expectProvider: 'fireworks', expectModel: 'glm' },
    // Claude — haiku
    { label: 'search tools needed',          taskClass: 'general', risk: 'low',    text: 'search for the config file',           expectProvider: 'claude',    expectModel: 'haiku' },
    // Claude — sonnet (MCP required)
    { label: 'coralogix logs',               taskClass: 'alert',   risk: 'medium', text: 'check coralogix logs for errors',      expectProvider: 'claude',    expectModel: 'sonnet' },
    { label: 'investigate alert',            taskClass: 'alert',   risk: 'medium', text: 'investigate the latency spike',        expectProvider: 'claude',    expectModel: 'sonnet' },
    { label: 'k8s pod issue',               taskClass: 'ops',     risk: 'medium', text: 'check the pod restart in namespace',    expectProvider: 'claude',    expectModel: 'sonnet' },
    { label: 'draft incident update',        taskClass: 'comms',   risk: 'medium', text: 'draft an incident update',             expectProvider: 'claude',    expectModel: 'sonnet' },
    // Claude — opus
    { label: 'think deeply',                 taskClass: 'general', risk: 'medium', text: 'think deeply about scaling strategy',  expectProvider: 'claude',    expectModel: 'opus' },
    // User overrides
    { label: 'override: use kimi on alert',  taskClass: 'alert',   risk: 'high',   text: 'use kimi: quick summary',              expectProvider: 'fireworks', expectModel: 'kimi' },
    { label: 'override: use glm',            taskClass: 'general', risk: 'low',    text: 'use glm: explain why db is slow',      expectProvider: 'fireworks', expectModel: 'glm' },
    { label: 'override: use opus',           taskClass: 'todo',    risk: 'low',    text: 'use opus to think through this',       expectProvider: 'claude',    expectModel: 'opus' },
    { label: 'override: with haiku',         taskClass: 'alert',   risk: 'high',   text: 'with haiku list the open alerts',      expectProvider: 'claude',    expectModel: 'haiku' },
  ];

  let passed = 0; let failed = 0;
  const W = 34;
  console.log(`\n  ${'Case'.padEnd(W)}  ${'Expected'.padEnd(18)}  ${'Got'.padEnd(22)}  Result`);
  console.log('  ' + '─'.repeat(85));

  for (const c of cases) {
    const sel = selectModel(c.taskClass, c.risk, c.text, routing);
    const modelShort = sel.model.replace('accounts/fireworks/models/', '').replace('claude-', '');
    const ok = sel.provider === c.expectProvider && modelShort.includes(c.expectModel);
    const got = `${modelShort} · ${sel.provider}`;
    const exp = `${c.expectModel} · ${c.expectProvider}`;
    const override = sel.userOverride ? CYAN(' [override]') : '';
    console.log(`  ${c.label.slice(0, W).padEnd(W)}  ${exp.padEnd(18)}  ${got.padEnd(22)}${override}  ${ok ? PASS : FAIL}`);
    ok ? passed++ : failed++;
  }

  console.log(`\n  ${GREEN(`${passed} passed`)}  ${failed > 0 ? RED(`${failed} failed`) : ''}\n`);
  return failed === 0;
}

// ---------------------------------------------------------------------------
// 2. Permission gates
// ---------------------------------------------------------------------------
function testPermissions(): boolean {
  console.log(BOLD('═══ 2. Permission Gates ═══'));

  const OWNER = 'U_OWNER';
  const STRANGER = 'U_STRANGER';

  const baseCtx = {
    ownerUserId: OWNER,
    allowConversationsWithOthers: false,
    allowDmFromOthers: false,
    allowMentionsFromOthers: false,
    allowedUserIds: [],
    allowedChannelIds: [],
  };

  // --- Access Policy ---
  console.log(`\n  ${BOLD('Access Policy')}`);

  const accessCases: Array<{
    label: string;
    ctx: Partial<AccessContext> & Pick<AccessContext, 'actorId' | 'source' | 'conversationId'>;
    expectAllow: boolean;
    expectReason?: string;
  }> = [
    {
      label: 'owner via Slack → allow',
      ctx: { actorId: OWNER, source: 'slack', conversationId: 'C1:t1', channelId: 'C1' },
      expectAllow: true,
    },
    {
      label: 'owner via CLI → allow',
      ctx: { actorId: OWNER, source: 'cli', conversationId: 'cli:1' },
      expectAllow: true,
    },
    {
      label: 'system source → allow',
      ctx: { actorId: 'system', source: 'system', conversationId: 'sys:1' },
      expectAllow: true,
    },
    {
      label: 'stranger Slack (others disabled) → deny',
      ctx: { actorId: STRANGER, source: 'slack', conversationId: 'C1:t1', channelId: 'C1' },
      expectAllow: false,
      expectReason: 'conversations with others',
    },
    {
      label: 'stranger Slack DM (others enabled, DM disabled) → deny',
      ctx: { actorId: STRANGER, source: 'slack', conversationId: 'D1:t1', channelId: 'D1',
             allowConversationsWithOthers: true } as never,
      expectAllow: false,
      expectReason: 'DMs from non-owners',
    },
    {
      label: 'stranger allowed by allowedUserIds → allow',
      ctx: { actorId: STRANGER, source: 'slack', conversationId: 'C1:t1', channelId: 'C1',
             allowConversationsWithOthers: true, allowMentionsFromOthers: true,
             allowedUserIds: [STRANGER] } as never,
      expectAllow: true,
    },
    {
      label: 'no ownerUserId configured → deny',
      ctx: { actorId: OWNER, source: 'cli', conversationId: 'cli:1',
             ownerUserId: '' } as never,
      expectAllow: false,
      expectReason: 'owner identity not configured',
    },
  ];

  let passed = 0; let failed = 0;
  const W = 46;

  for (const c of accessCases) {
    const ctx: AccessContext = { ...baseCtx, ...c.ctx };
    const decision = checkAccess(ctx);
    const allowOk = decision.allow === c.expectAllow;
    const reasonOk = !c.expectReason || (decision.reason ?? '').includes(c.expectReason.split(' ')[0]);
    const ok = allowOk && reasonOk;
    const outcome = decision.allow ? GREEN('allow') : RED(`deny: ${decision.reason}`);
    console.log(`  ${c.label.slice(0, W).padEnd(W)}  ${outcome.padEnd(40)}  ${ok ? PASS : FAIL}`);
    ok ? passed++ : failed++;
  }

  // --- Risk Classification ---
  console.log(`\n  ${BOLD('Risk Classification')}`);

  const riskCases: Array<{ text: string; expect: 'low' | 'medium' | 'high' }> = [
    { text: 'show todos',                    expect: 'low' },
    { text: 'search for logs',               expect: 'low' },
    { text: 'send a message to #general',    expect: 'medium' },
    { text: 'post update to channel',        expect: 'medium' },
    { text: 'write a file to disk',          expect: 'high' },
    { text: 'execute the deployment script', expect: 'high' },
    { text: 'edit the config',               expect: 'high' },
  ];

  for (const c of riskCases) {
    const got = classifyRisk(c.text);
    const ok = got === c.expect;
    const color = got === 'low' ? GREEN : got === 'medium' ? YELLOW : RED;
    console.log(`  ${c.text.padEnd(38)}  expect: ${c.expect.padEnd(7)}  got: ${color(got.padEnd(7))}  ${ok ? PASS : FAIL}`);
    ok ? passed++ : failed++;
  }

  // --- Safety Precheck ---
  console.log(`\n  ${BOLD('Safety Precheck')}`);

  const makeEnvelope = (userInput: string, allowedTools: string[] = []): PromptEnvelope => ({
    taskClass: 'general',
    persona: 'Robin',
    policyConstraints: [],
    memoryContext: [],
    channelContext: [],
    allowedTools,
    responseContract: { format: 'plain', allowExternalLinks: false },
    userInput,
  });

  const safetyPerms: Array<{
    label: string;
    envelope: PromptEnvelope;
    expectAllow: boolean;
    description: string;
  }> = [
    {
      label: 'clean input + read-only tools → allow',
      envelope: makeEnvelope('show todos', ['Read', 'Glob']),
      expectAllow: true,
      description: 'Normal request passes through',
    },
    {
      label: 'input with Slack token → deny',
      envelope: makeEnvelope('use token xoxb-111-222-abc for this'),
      expectAllow: false,
      description: 'Secret in input blocked before LLM sees it',
    },
    {
      label: 'input with API key → deny',
      envelope: makeEnvelope('key is sk-' + 'a'.repeat(25)),
      expectAllow: false,
      description: 'API key in input blocked',
    },
    {
      label: 'Write in allowedTools → deny',
      envelope: makeEnvelope('edit this file', ['Read', 'Write']),
      expectAllow: false,
      description: 'Forbidden tool (Write) blocked — LLM cannot edit files',
    },
    {
      label: 'Bash in allowedTools → deny',
      envelope: makeEnvelope('run this command', ['Read', 'Bash']),
      expectAllow: false,
      description: 'Forbidden tool (Bash) blocked — LLM cannot execute shell',
    },
    {
      label: 'input > 10000 chars → deny',
      envelope: makeEnvelope('a'.repeat(10001)),
      expectAllow: false,
      description: 'Oversized input blocked before LLM',
    },
  ];

  for (const c of safetyPerms) {
    const decision = safetyPrecheck(c.envelope);
    const ok = decision.allow === c.expectAllow;
    const outcome = decision.allow ? GREEN('allow') : RED(`deny: ${decision.reason?.slice(0, 35)}`);
    console.log(`  ${c.label.slice(0, W).padEnd(W)}  ${outcome.padEnd(48)}  ${ok ? PASS : FAIL}`);
    if (!ok || !decision.allow) console.log(`    ${DIM(c.description)}`);
    ok ? passed++ : failed++;
  }

  // --- Tool policy by risk level ---
  console.log(`\n  ${BOLD('Tool Policy by Risk (what LLM can use at each level)')}`);

  const toolPolicy = {
    low:    ['Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch'],
    medium: ['Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch'],
    high:   [],
  };

  for (const [level, tools] of Object.entries(toolPolicy)) {
    const color = level === 'low' ? GREEN : level === 'medium' ? YELLOW : RED;
    const toolStr = tools.length ? tools.join(', ') : RED('none (blocked)');
    console.log(`  ${color(level.padEnd(8))}  tools: ${toolStr}`);
  }

  console.log(`\n  ${GREEN(`${passed} passed`)}  ${failed > 0 ? RED(`${failed} failed`) : ''}\n`);
  return failed === 0;
}

// ---------------------------------------------------------------------------
// 3. Fireworks live calls
// ---------------------------------------------------------------------------
async function callFireworks(model: string, prompt: string): Promise<{ text: string; ms: number }> {
  const apiKey = process.env.FIREWORKS_API_KEY;
  if (!apiKey) throw new Error('FIREWORKS_API_KEY not set');

  const system = 'You are Robin, a concise personal assistant. Reply in 1-2 sentences maximum.';
  const start = Date.now();
  const res = await fetch('https://api.fireworks.ai/inference/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
      max_tokens: 128,
      temperature: 0.1,
    }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text().catch(() => res.statusText)}`);
  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  return { text: data.choices?.[0]?.message?.content ?? '', ms: Date.now() - start };
}

async function testFireworks(): Promise<boolean> {
  console.log(BOLD('═══ 3. Fireworks Live Calls ═══\n'));

  if (!process.env.FIREWORKS_API_KEY) {
    console.log(`  ${SKIP}  FIREWORKS_API_KEY not set — skipping\n`);
    return true;
  }

  const cases = [
    {
      label: 'kimi2.5 — todo command suggestion',
      model: KIMI_MODEL,
      prompt: 'My task "look at unblocking repo" is now done. Give me only the robin command to mark it done. The task id is 1082f5ff.',
      validate: (t: string) => /mark done/i.test(t) && /1082f5ff/.test(t),
      expectHint: 'should return: mark done: 1082f5ff',
    },
    {
      label: 'kimi2.5 — factual (fast path)',
      model: KIMI_MODEL,
      prompt: 'What is the capital of France?',
      validate: (t: string) => /paris/i.test(t),
      expectHint: 'should contain: Paris',
    },
    {
      label: 'kimi2.5 — concise answer',
      model: KIMI_MODEL,
      prompt: 'Name the 4 inner planets of the solar system. One line only.',
      validate: (t: string) => /mercury|mars|venus|earth/i.test(t),
      expectHint: 'should mention Mercury, Venus, Earth, Mars',
    },
    {
      label: 'glm5 — analytical response',
      model: GLM_MODEL,
      prompt: 'Why does microservices architecture increase operational complexity? Be concise.',
      validate: (t: string) => t.length > 30,
      expectHint: 'should give a substantive answer',
    },
    {
      label: 'glm5 — thoughtful explanation',
      model: GLM_MODEL,
      prompt: 'In one sentence: what is the trade-off between consistency and availability in distributed systems?',
      validate: (t: string) => t.length > 30,
      expectHint: 'should give a real answer',
    },
  ];

  let passed = 0; let failed = 0;
  const W = 44;

  for (const c of cases) {
    process.stdout.write(`  ${c.label.slice(0, W).padEnd(W)} `);
    try {
      const { text, ms } = await callFireworks(c.model, c.prompt);
      const ok = c.validate(text);
      const preview = text.slice(0, 55).replace(/\n/g, ' ');
      console.log(`${ok ? PASS : FAIL}  ${DIM(`${ms}ms`)}  ${DIM(preview)}`);
      if (!ok) console.log(`    ${YELLOW('hint: ' + c.expectHint)}`);
      ok ? passed++ : failed++;
    } catch (e) {
      console.log(`${FAIL}  ${RED(String(e))}`);
      failed++;
    }
  }

  console.log(`\n  ${GREEN(`${passed} passed`)}  ${failed > 0 ? RED(`${failed} failed`) : ''}\n`);
  return failed === 0;
}

// ---------------------------------------------------------------------------
// 4. Claude live calls (direct Messages API)
// ---------------------------------------------------------------------------
async function testClaude(): Promise<boolean> {
  console.log(BOLD('═══ 4. Claude Live Calls ═══\n'));

  const useVertex = process.env.CLAUDE_CODE_USE_VERTEX === '1';
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

  if (!hasApiKey && !useVertex) {
    console.log(`  ${SKIP}  No ANTHROPIC_API_KEY and CLAUDE_CODE_USE_VERTEX not set — skipping\n`);
    return true;
  }

  // Use Vertex SDK when running via Google Cloud Vertex (no direct API key needed)
  const client = useVertex && !hasApiKey
    ? new AnthropicVertex({
        projectId: process.env.ANTHROPIC_VERTEX_PROJECT_ID ?? 'pod-velocity-claude-code',
        region: process.env.CLOUD_ML_REGION ?? 'global',
      }) as unknown as Anthropic
    : new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const cases: Array<{
    label: string;
    model: string;
    prompt: string;
    system?: string;
    validate: (t: string) => boolean;
    expectHint: string;
  }> = [
    {
      label: 'sonnet — observe mode (no direct answer)',
      model: 'claude-sonnet-4-6',
      system: 'You are Robin. Current mode: observe. In observe mode, do not answer directly — acknowledge and explain you are in observe mode.',
      prompt: 'What is the capital of France?',
      validate: (t: string) => /observe/i.test(t),
      expectHint: 'observe mode: should NOT answer directly',
    },
    {
      label: 'sonnet — reply mode (full answer)',
      model: 'claude-sonnet-4-6',
      system: 'You are Robin. Current mode: reply. Answer directly and concisely.',
      prompt: 'What is the capital of France?',
      validate: (t: string) => /paris/i.test(t),
      expectHint: 'reply mode: should answer with Paris',
    },
    {
      label: 'sonnet — MCP-aware, suggests tool use',
      model: 'claude-sonnet-4-6',
      system: 'You are Robin. You have access to a Coralogix MCP tool. When asked to investigate, mention you would use Coralogix.',
      prompt: 'Investigate the payment latency spike from earlier today.',
      validate: (t: string) => t.length > 30,
      expectHint: 'should produce an investigation response',
    },
    {
      label: 'sonnet — respects no-tool restriction (limited permissions)',
      model: 'claude-sonnet-4-6',
      system: 'You are Robin. You have NO tools available. If asked to search, read files, or access external systems, say you cannot do that with your current permissions.',
      prompt: 'Search for all log entries from the payments service.',
      validate: (t: string) => /cannot|unable|no.*tool|permission|limit/i.test(t),
      expectHint: 'limited perms: should say it cannot search without tools',
    },
  ];

  let passed = 0; let failed = 0;
  const W = 46;

  for (const c of cases) {
    process.stdout.write(`  ${c.label.slice(0, W).padEnd(W)} `);
    try {
      const start = Date.now();
      const messages: Anthropic.Messages.MessageParam[] = [{ role: 'user', content: c.prompt }];
      const req: Anthropic.Messages.MessageCreateParamsNonStreaming = {
        model: c.model,
        max_tokens: 256,
        messages,
      };
      if (c.system) req.system = c.system;

      const res = await client.messages.create(req);
      const ms = Date.now() - start;
      const text = res.content[0].type === 'text' ? res.content[0].text : '';
      const ok = c.validate(text);
      const preview = text.slice(0, 55).replace(/\n/g, ' ');
      console.log(`${ok ? PASS : FAIL}  ${DIM(`${ms}ms`)}  ${DIM(preview)}`);
      if (!ok) console.log(`    ${YELLOW('hint: ' + c.expectHint)}`);
      ok ? passed++ : failed++;
    } catch (e) {
      console.log(`${FAIL}  ${RED(String(e))}`);
      failed++;
    }
  }

  console.log(`\n  ${GREEN(`${passed} passed`)}  ${failed > 0 ? RED(`${failed} failed`) : ''}\n`);
  return failed === 0;
}

// ---------------------------------------------------------------------------
// 5. MCP registry check
// ---------------------------------------------------------------------------
function testMcp(): boolean {
  console.log(BOLD('═══ 5. MCP Registry (from ~/.claude.json) ═══\n'));

  const servers = loadClaudeCodeMcpServers();
  const names = Object.keys(servers);

  if (names.length === 0) {
    console.log(`  ${YELLOW('No MCP servers found in ~/.claude.json')}\n`);
    return true;
  }

  const mcpRouted = ['coralogix', 'github', 'spinnaker', 'gandalf', 'slack'];

  for (const [name, cfg] of Object.entries(servers)) {
    const transport = cfg.type;
    const target = cfg.type === 'stdio'
      ? `${cfg.command} ${(cfg.args ?? []).join(' ')}`.slice(0, 45)
      : (cfg as { url: string }).url?.slice(0, 45) ?? '';
    const envKeys = cfg.type === 'stdio' && cfg.env ? Object.keys(cfg.env) : [];
    const hasSecrets = envKeys.length > 0 ? CYAN(`secrets: ${envKeys.join(', ')}`) : '';
    const autoRouted = mcpRouted.some(k => name.toLowerCase().includes(k)) ? GREEN(' → sonnet') : '';
    console.log(`  ${PASS}  ${BOLD(name.padEnd(20))}  ${DIM(transport.padEnd(14))}  ${DIM(target)}  ${hasSecrets}${autoRouted}`);
  }

  console.log(`\n  ${GREEN(`${names.length} server(s) registered`)}  ${DIM('(tagged → sonnet = auto-routes to Claude Sonnet when used)')}\n`);
  return true;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(BOLD('\nRobin LLM Capability Tests'));
  console.log(DIM(`Fireworks key : ${process.env.FIREWORKS_API_KEY ? 'set ✓' : 'missing'}`));
  console.log(DIM(`Claude        : ${process.env.ANTHROPIC_API_KEY ? 'api key set ✓' : process.env.CLAUDE_CODE_USE_VERTEX === '1' ? 'vertex ✓' : 'missing'}`));

  const results: boolean[] = [];

  if (runRouting)   results.push(testRouting());
  if (runPerms)     results.push(testPermissions());
  if (runFireworks) results.push(await testFireworks());
  if (runClaude)    results.push(await testClaude());
  if (runMcp)       results.push(testMcp());

  const allPassed = results.every(Boolean);
  console.log(allPassed
    ? GREEN(BOLD('All tests passed\n'))
    : RED(BOLD('Some tests failed — check output above\n')));

  process.exit(allPassed ? 0 : 1);
}

main().catch((e) => { console.error(RED(String(e))); process.exit(1); });
