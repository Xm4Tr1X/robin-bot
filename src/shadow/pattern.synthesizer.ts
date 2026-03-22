import { SandboxLlmClient } from '../sandbox/llm.client';
import type { ActivityRecord } from './activity.types';

export interface PatternSynthesisResult {
  preferences: string[];
  patterns: string[];
  noChange: boolean;
}

const SYSTEM_PROMPT = `You are a behavioral pattern analyzer. Given a list of owner activity observations from Slack, extract stable preferences and behavioral patterns.

Return ONLY a JSON object with this exact shape (no markdown, no explanation):
{"preferences": ["string", ...], "patterns": ["string", ...]}

- preferences: stable stylistic or workflow preferences (e.g. "prefers bullet lists", "likes concise answers")
- patterns: recurring behavioral patterns (e.g. "reviews PRs in the afternoon", "checks Slack before stand-up")
- Keep each entry under 100 characters
- Only include entries that are clearly supported by the observations
- Return empty arrays if nothing meaningful can be extracted`;

export class PatternSynthesizer {
  private client: SandboxLlmClient;

  constructor(apiKey: string) {
    this.client = new SandboxLlmClient({
      apiKey,
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 512,
    });
  }

  async synthesize(
    activityRecords: ActivityRecord[],
    existingPatterns: string[],
  ): Promise<PatternSynthesisResult> {
    const empty: PatternSynthesisResult = { preferences: [], patterns: [], noChange: true };

    if (activityRecords.length === 0) return empty;

    const observations = activityRecords.map((r) => `- ${r.text}`).join('\n');
    const prompt = `Here are recent owner activity observations from Slack:\n\n${observations}\n\nExtract preferences and behavioral patterns as JSON.`;

    try {
      const raw = await this.client.chat([], prompt);
      const parsed = JSON.parse(raw) as { preferences?: unknown; patterns?: unknown };

      const rawPrefs = Array.isArray(parsed.preferences)
        ? (parsed.preferences as unknown[]).filter((p): p is string => typeof p === 'string')
        : [];
      const rawPatterns = Array.isArray(parsed.patterns)
        ? (parsed.patterns as unknown[]).filter((p): p is string => typeof p === 'string')
        : [];

      const existingLower = existingPatterns.map((p) => p.toLowerCase());
      const newPrefs = rawPrefs.filter((p) => !existingLower.includes(p.toLowerCase()));
      const newPatterns = rawPatterns.filter((p) => !existingLower.includes(p.toLowerCase()));

      const noChange = newPrefs.length === 0 && newPatterns.length === 0;
      return { preferences: newPrefs, patterns: newPatterns, noChange };
    } catch {
      return empty;
    }
  }
}
