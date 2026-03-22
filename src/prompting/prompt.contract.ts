import type { PromptEnvelope } from '../contracts';

// ---------------------------------------------------------------------------
// Envelope → prompt string
// ---------------------------------------------------------------------------

/**
 * Formats a PromptEnvelope into a plain-text prompt string suitable for
 * passing to an LLM as the user turn.
 *
 * Format:
 *   [Mode: {mode from channelContext}]
 *   [Policy: {policyConstraints joined by '; ' or 'none'}]
 *   [Memory:
 *   {memoryContext joined by '\n' or 'none'}]
 *   [Active tools: {allowedTools joined by ', ' or 'none'}]
 *
 *   User: {userInput}
 */
export function envelopeToPromptString(envelope: PromptEnvelope): string {
  const { channelContext, policyConstraints, memoryContext, allowedTools, userInput } = envelope;

  // Extract [mode: ...] from channelContext
  const modeLine = channelContext.find((c) => c.startsWith('[mode:')) ?? '[mode: unknown]';

  // Extract extra context blocks (e.g. [current todos]) — everything that isn't [mode:] or [source:]
  const extraContext = channelContext.filter(
    (c) => !c.startsWith('[mode:') && !c.startsWith('[source:'),
  );

  const policy = policyConstraints.length > 0 ? policyConstraints.join('; ') : 'none';
  const memory = memoryContext.length > 0 ? memoryContext.join('\n') : 'none';
  const tools = allowedTools.length > 0 ? allowedTools.join(', ') : 'none';

  const parts = [
    `[Mode: ${modeLine}]`,
    `[Policy: ${policy}]`,
    `[Memory:\n${memory}]`,
    `[Active tools: ${tools}]`,
  ];

  if (extraContext.length > 0) {
    parts.push(...extraContext);
  }

  parts.push('', `User: ${userInput}`);

  return parts.join('\n');
}
