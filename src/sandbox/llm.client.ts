import Anthropic from '@anthropic-ai/sdk';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface SandboxClientConfig {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  systemPrompt?: string;
}

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_SYSTEM_PROMPT = 'You are Robin, a helpful assistant. Be concise and precise.';

export class SandboxLlmClient {
  private client: Anthropic;
  private model: string;
  private maxTokens: number;
  private systemPrompt: string;

  constructor(config?: SandboxClientConfig) {
    this.client = new Anthropic({
      apiKey: config?.apiKey ?? process.env.ANTHROPIC_API_KEY,
    });
    this.model = config?.model ?? DEFAULT_MODEL;
    this.maxTokens = config?.maxTokens ?? DEFAULT_MAX_TOKENS;
    this.systemPrompt = config?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
  }

  async chat(history: Message[], userMessage: string): Promise<string> {
    const messages: Anthropic.MessageParam[] = [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: userMessage },
    ];

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: this.systemPrompt,
      messages,
    });

    const firstBlock = response.content[0];
    if (firstBlock.type !== 'text') {
      throw new Error(`Unexpected content block type: ${firstBlock.type}`);
    }
    return firstBlock.text;
  }
}
