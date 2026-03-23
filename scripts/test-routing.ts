/**
 * Smoke-test for model routing. Run with:
 *   npx tsx scripts/test-routing.ts
 */

import { selectModel } from '../src/runtime/model.selector';

const routing = {
  enabled: true,
  defaultModel: 'claude-sonnet-4-6',
  reasoningModel: 'claude-opus-4-6',
  actionModel: 'accounts/fireworks/models/kimi-k2p5',
  // reviewerModel removed — glm5 dropped for hallucination
};

const cases: Array<{ label: string; taskClass: Parameters<typeof selectModel>[0]; risk: Parameters<typeof selectModel>[1]; text: string }> = [
  { label: 'show todos (deterministic — never reaches LLM)',       taskClass: 'todo',    risk: 'low',    text: 'show todos' },
  { label: 'repos are unblocked, its done',                        taskClass: 'todo',    risk: 'low',    text: 'repos are unblocked, its done' },
  { label: 'change task name to X',                                taskClass: 'todo',    risk: 'low',    text: 'change move kaya to move cinepolis' },
  { label: 'quick factual question',                               taskClass: 'general', risk: 'low',    text: 'what time is it in IST' },
  { label: 'explain why the latency is high',                      taskClass: 'general', risk: 'medium', text: 'explain why the latency is high' },
  { label: 'summarize last week',                                  taskClass: 'general', risk: 'low',    text: 'summarize what happened last week' },
  { label: 'search for something',                                 taskClass: 'general', risk: 'low',    text: 'search for the config file' },
  { label: 'investigate alert in #incidents',                      taskClass: 'alert',   risk: 'medium', text: 'investigate the latency alert in #incidents' },
  { label: 'coralogix logs query',                                 taskClass: 'alert',   risk: 'medium', text: 'check coralogix logs for payment errors' },
  { label: 'draft incident update',                                taskClass: 'comms',   risk: 'medium', text: 'draft an incident update' },
  { label: 'think through architecture decision',                  taskClass: 'general', risk: 'medium', text: 'think through the architecture decision for the new service' },
  { label: 'deep dive root cause',                                 taskClass: 'ops',     risk: 'high',   text: 'deep dive into the root cause of last week outage' },
  { label: 'think deeply about strategy',                          taskClass: 'general', risk: 'medium', text: 'think deeply about our long-term strategy' },
];

const W = 48;
console.log('\n' + '─'.repeat(90));
console.log('Model Routing Decisions');
console.log('─'.repeat(90));
console.log(`${'Input'.padEnd(W)}  ${'Model'.padEnd(22)}  Provider`);
console.log('─'.repeat(90));

for (const { label, taskClass, risk, text } of cases) {
  const sel = selectModel(taskClass, risk, text, routing);
  const modelShort = sel.model.replace('accounts/fireworks/models/', '').replace('claude-', '');
  console.log(`${label.slice(0, W).padEnd(W)}  ${modelShort.padEnd(22)}  ${sel.provider}`);
}

console.log('─'.repeat(90) + '\n');
