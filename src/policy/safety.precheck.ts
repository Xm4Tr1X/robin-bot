/**
 * Pre-LLM safety gate.
 * Checks the PromptEnvelope before sending to the runner.
 * Fail closed — if ANY check fails, the request is blocked.
 * Pure function — no I/O beyond console.warn for non-blocking warnings.
 */

import type { PromptEnvelope, PolicyDecision } from '../contracts';
import { containsSecrets } from './redaction';

// ---------------------------------------------------------------------------
// Forbidden tools that trigger a warning when present in allowedTools
// ---------------------------------------------------------------------------

const FORBIDDEN_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit', 'Bash']);

// ---------------------------------------------------------------------------
// safetyPrecheck
// ---------------------------------------------------------------------------

/**
 * Evaluate a PromptEnvelope against all pre-LLM safety rules.
 *
 * Evaluation order:
 *  1. userInput contains secrets       → deny
 *  2. Any memoryContext entry has secrets → deny
 *  3. allowedTools contains forbidden tools → warn, allow
 *  4. userInput length > 10000         → deny
 *  5. Otherwise                        → allow
 */
export function safetyPrecheck(envelope: PromptEnvelope): PolicyDecision {
  // Rule 1 — user input must not contain secrets
  if (containsSecrets(envelope.userInput)) {
    return deny('user input contains sensitive data');
  }

  // Rule 2 — memory context must not contain secrets
  for (const entry of envelope.memoryContext) {
    if (containsSecrets(entry)) {
      return deny('memory context contains sensitive data');
    }
  }

  // Rule 3 — block forbidden tools (was warn-only; now hard block)
  const presentForbidden = envelope.allowedTools.filter(t => FORBIDDEN_TOOLS.has(t));
  if (presentForbidden.length > 0) {
    return deny(`forbidden tool in allowedTools: ${presentForbidden.join(', ')}`);
  }

  // Rule 4 — user input must not exceed 10000 characters
  if (envelope.userInput.length > 10000) {
    return deny('input too long');
  }

  // Rule 5 — all checks passed
  return allow();
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function allow(): PolicyDecision {
  return { allow: true };
}

function deny(reason: string): PolicyDecision {
  return { allow: false, reason };
}
