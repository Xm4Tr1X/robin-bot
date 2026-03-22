/**
 * RunnerFactory — returns the correct RunnerClient for a given model selection.
 */

import type { RunnerClient } from './runner.client';
import { AgentSdkRunnerClient } from './runner.client';
import { FireworksRunnerClient } from './fireworks.client';
import type { ModelSelection } from './model.selector';

export interface RunnerFactoryConfig {
  fireworksApiKey?: string;
}

export function getRunnerClient(
  selection: ModelSelection,
  config: RunnerFactoryConfig,
): RunnerClient {
  if (selection.provider === 'fireworks') {
    const apiKey = config.fireworksApiKey ?? process.env.FIREWORKS_API_KEY ?? '';
    if (!apiKey) {
      console.warn('[robin] fireworks: FIREWORKS_API_KEY not set, falling back to Claude');
      return new AgentSdkRunnerClient();
    }
    return new FireworksRunnerClient(apiKey, selection.model);
  }

  // Claude — Agent SDK runner (sets model via ANTHROPIC_MODEL env if needed)
  return new AgentSdkRunnerClient();
}
