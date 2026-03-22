/**
 * Persona guard.
 * Checks that an LLM response does not violate persona rules.
 * Fail closed — any violation results in a deny decision.
 * Pure function — no I/O.
 */

import type { PolicyDecision } from '../contracts';

// ---------------------------------------------------------------------------
// Pattern definitions
// ---------------------------------------------------------------------------

interface PersonaRule {
  pattern: RegExp;
  reason: string;
}

const PERSONA_RULES: PersonaRule[] = [
  {
    // Identity impersonation: claiming to be the owner or the user
    pattern: /\bI am (OWNER|Ninaad|the user)\b/i,
    reason: 'persona violation: identity impersonation',
  },
  {
    // False identity claim: denying AI/bot status
    pattern: /\bI am (a human|not an AI|not a bot)\b/i,
    reason: 'persona violation: false identity claim',
  },
  {
    // Prompt injection: requesting system-prompt modifications
    pattern: /\bupdate (your|my) system prompt\b/i,
    reason: 'persona violation: prompt injection attempt',
  },
  {
    // Prompt injection: instruction override attempts
    pattern: /\bignore (your|all) (previous )?instructions\b/i,
    reason: 'persona violation: prompt injection attempt',
  },
];

// ---------------------------------------------------------------------------
// personaGuard
// ---------------------------------------------------------------------------

/**
 * Check responseText against all persona rules.
 * Returns a deny decision on the first violation found.
 */
export function personaGuard(responseText: string): PolicyDecision {
  for (const rule of PERSONA_RULES) {
    if (rule.pattern.test(responseText)) {
      return { allow: false, reason: rule.reason };
    }
  }
  return { allow: true };
}
