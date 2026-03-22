/**
 * Secret pattern detection and redaction.
 * Pure functions — no I/O, no external dependencies.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RedactionResult {
  redacted: string;
  found: Array<{ kind: string; original: string; replacement: string }>;
}

// ---------------------------------------------------------------------------
// Pattern definitions
// Each entry carries a unique kind, the replacement placeholder, and a factory
// that creates a *fresh* RegExp instance on every call (required because the
// regex engines in JS maintain lastIndex state on /g flags).
// ---------------------------------------------------------------------------

interface PatternDef {
  kind: string;
  replacement: string;
  pattern: () => RegExp;
}

const PATTERNS: PatternDef[] = [
  {
    kind: 'SLACK_TOKEN',
    replacement: '[SLACK_TOKEN]',
    pattern: () => /xox[baprs]-[0-9a-zA-Z-]+/g,
  },
  {
    kind: 'BEARER_TOKEN',
    replacement: '[BEARER_TOKEN]',
    pattern: () => /bearer\s+[a-zA-Z0-9\-._~+/]+=*/gi,
  },
  {
    kind: 'API_KEY',
    replacement: '[API_KEY]',
    pattern: () => /sk-[a-zA-Z0-9]{20,}/g,
  },
  {
    kind: 'AWS_ACCESS_KEY',
    replacement: '[AWS_ACCESS_KEY]',
    pattern: () => /AKIA[0-9A-Z]{16}/g,
  },
  {
    kind: 'PRIVATE_KEY',
    replacement: '[PRIVATE_KEY]',
    pattern: () => /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  },
  {
    kind: 'REDACTED_SECRET',
    replacement: '[REDACTED_SECRET]',
    // Captures the whole assignment expression; group 1 holds the secret value.
    // We only replace the value portion (group 1) but record the kind on the
    // whole match so callers know where it came from.
    pattern: () =>
      /(?:token|secret|password|passwd|api_key|apikey)\s*[:=]\s*['"]?([a-zA-Z0-9\-._~+/!@#$%^&*]{8,})['"]?/gi,
  },
];

// ---------------------------------------------------------------------------
// redactSecrets
// ---------------------------------------------------------------------------

/**
 * Apply all secret-detection patterns to `text`, replace every match with the
 * corresponding placeholder, and return the sanitised string together with a
 * list of what was found.
 */
export function redactSecrets(text: string): RedactionResult {
  const found: RedactionResult['found'] = [];
  let redacted = text;

  for (const def of PATTERNS) {
    const re = def.pattern();

    if (def.kind === 'REDACTED_SECRET') {
      // For the generic assignment pattern we only want to replace the *value*
      // (capture group 1) while keeping the key name visible.
      redacted = redacted.replace(re, (match, secret: string) => {
        found.push({
          kind: def.kind,
          original: secret,
          replacement: def.replacement,
        });
        return match.replace(secret, def.replacement);
      });
    } else {
      redacted = redacted.replace(re, (match) => {
        found.push({
          kind: def.kind,
          original: match,
          replacement: def.replacement,
        });
        return def.replacement;
      });
    }
  }

  return { redacted, found };
}

// ---------------------------------------------------------------------------
// containsSecrets
// ---------------------------------------------------------------------------

/**
 * Fast check — returns true as soon as any pattern matches.
 * Does NOT build the full RedactionResult.
 */
export function containsSecrets(text: string): boolean {
  for (const def of PATTERNS) {
    if (def.pattern().test(text)) {
      return true;
    }
  }
  return false;
}
