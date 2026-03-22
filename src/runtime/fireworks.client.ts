/**
 * FireworksRunnerClient — runs open source models (kimi2.5, glm5) via
 * Fireworks AI's OpenAI-compatible chat completions API.
 *
 * No tools. No MCP. Pure fast text in / text out.
 * Use for well-defined, tool-free tasks where speed matters.
 */

import type { RunnerClient } from './runner.client';
import type { RunnerRequest, RunnerResponse } from '../contracts';
import { envelopeToPromptString } from '../prompting/prompt.contract';
import { activityBus } from '../display/activity.bus';

const FIREWORKS_BASE_URL = 'https://api.fireworks.ai/inference/v1';

export class FireworksRunnerClient implements RunnerClient {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async run(request: RunnerRequest): Promise<RunnerResponse> {
    const { requestId, envelope } = request;
    const startMs = Date.now();

    const userMessage = envelopeToPromptString(envelope);

    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: envelope.persona },
        { role: 'user',   content: userMessage },
      ],
      max_tokens: 1024,
      temperature: 0.1,
    };

    let responseText = '';
    try {
      const res = await fetch(`${FIREWORKS_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.text().catch(() => res.statusText);
        throw new Error(`Fireworks API error ${res.status}: ${err}`);
      }

      const data = await res.json() as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      responseText = data.choices?.[0]?.message?.content ?? '';
    } finally {
      activityBus.emit({ kind: 'completing', durationMs: Date.now() - startMs });
    }

    return {
      requestId,
      sessionId: '',        // Fireworks is stateless — no session continuity
      text: responseText,
      toolTrace: [],
    };
  }
}
