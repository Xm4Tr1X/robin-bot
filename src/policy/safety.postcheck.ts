/**
 * Post-LLM safety gate.
 * Checks the RunnerResponse before publishing to any egress adapter.
 * Pure function — no I/O.
 */

import type { RunnerResponse, PolicyDecision } from '../contracts';
import { redactSecrets } from './redaction';

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export type PostcheckResult = PolicyDecision & { safeText: string };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_RESPONSE_LENGTH = 20000;
const TRUNCATION_MARKER = '[response truncated]';

// ---------------------------------------------------------------------------
// safetyPostcheck
// ---------------------------------------------------------------------------

/**
 * Evaluate a RunnerResponse against all post-LLM safety rules.
 *
 * Evaluation order:
 *  1. Empty response.text               → deny, safeText = ''
 *  2. Redact secrets from response.text
 *  3. Truncate if safeText > 20000 chars
 *  4. Otherwise                         → allow with (possibly redacted) safeText
 */
export function safetyPostcheck(response: RunnerResponse): PostcheckResult {
  // Rule 1 — empty response is not allowed
  if (response.text === '') {
    return { allow: false, reason: 'empty response', safeText: '' };
  }

  // Rule 2 — redact any secrets present in the response text
  const { redacted, found } = redactSecrets(response.text);

  // Build the redactions array for PolicyDecision when secrets were found
  const redactions: PolicyDecision['redactions'] =
    found.length > 0
      ? found.map(f => ({ kind: f.kind, from: f.original, to: f.replacement }))
      : undefined;

  // Rule 3 — truncate if necessary
  let safeText = redacted;
  if (safeText.length > MAX_RESPONSE_LENGTH) {
    safeText = safeText.slice(0, MAX_RESPONSE_LENGTH) + TRUNCATION_MARKER;
  }

  // Rule 4 — allow with safe text (and optional redactions metadata)
  const decision: PostcheckResult = { allow: true, safeText };
  if (redactions !== undefined) {
    decision.redactions = redactions;
  }
  return decision;
}
