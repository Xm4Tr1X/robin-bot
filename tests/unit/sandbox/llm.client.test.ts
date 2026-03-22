import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock @anthropic-ai/sdk before importing the module under test.
// ---------------------------------------------------------------------------

vi.mock('@anthropic-ai/sdk', () => {
  const mockCreate = vi.fn();
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: { create: mockCreate },
    })),
    __mockCreate: mockCreate,
  };
});

// Import after mock is established
import Anthropic from '@anthropic-ai/sdk';
import { SandboxLlmClient, Message } from '../../../src/sandbox/llm.client';

// Helper to retrieve the shared mockCreate from the module mock
function getMockCreate(): ReturnType<typeof vi.fn> {
  // Each Anthropic instance returned by the mock constructor exposes messages.create
  const AnthropicMock = Anthropic as unknown as ReturnType<typeof vi.fn>;
  const lastInstance = AnthropicMock.mock.results[AnthropicMock.mock.results.length - 1]?.value as {
    messages: { create: ReturnType<typeof vi.fn> };
  };
  return lastInstance.messages.create;
}

// ---------------------------------------------------------------------------

describe('SandboxLlmClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Constructor tests
  // -------------------------------------------------------------------------

  it('uses default model claude-sonnet-4-6 when none provided', () => {
    const client = new SandboxLlmClient();
    // We verify indirectly: when chat() is called it passes the default model
    const mockCreate = getMockCreate();
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'hello' }],
    });

    return client.chat([], 'hi').then(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-sonnet-4-6' }),
      );
    });
  });

  it('accepts a custom model from config', () => {
    const client = new SandboxLlmClient({ model: 'claude-opus-4-5' });
    const mockCreate = getMockCreate();
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'hello' }],
    });

    return client.chat([], 'hi').then(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-opus-4-5' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // chat() — API call shape
  // -------------------------------------------------------------------------

  it('calls messages.create with correct model, max_tokens, and messages array', async () => {
    const client = new SandboxLlmClient({ model: 'claude-sonnet-4-6', maxTokens: 512 });
    const mockCreate = getMockCreate();
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'pong' }],
    });

    await client.chat([], 'ping');

    expect(mockCreate).toHaveBeenCalledOnce();
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-sonnet-4-6',
        max_tokens: 512,
        messages: [{ role: 'user', content: 'ping' }],
      }),
    );
  });

  it('includes the system prompt in the API call', async () => {
    const client = new SandboxLlmClient({
      systemPrompt: 'Custom system prompt.',
    });
    const mockCreate = getMockCreate();
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'ok' }],
    });

    await client.chat([], 'hello');

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ system: 'Custom system prompt.' }),
    );
  });

  it('passes full conversation history plus new user message', async () => {
    const client = new SandboxLlmClient();
    const mockCreate = getMockCreate();
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'fine thanks' }],
    });

    const history: Message[] = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi there' },
    ];

    await client.chat(history, 'how are you?');

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'hi there' },
          { role: 'user', content: 'how are you?' },
        ],
      }),
    );
  });

  // -------------------------------------------------------------------------
  // chat() — response extraction
  // -------------------------------------------------------------------------

  it('extracts text from the first content block', async () => {
    const client = new SandboxLlmClient();
    const mockCreate = getMockCreate();
    mockCreate.mockResolvedValueOnce({
      content: [
        { type: 'text', text: 'extracted text' },
        { type: 'text', text: 'ignored second block' },
      ],
    });

    const result = await client.chat([], 'question');

    expect(result).toBe('extracted text');
  });

  it('works with an empty history (first message in conversation)', async () => {
    const client = new SandboxLlmClient();
    const mockCreate = getMockCreate();
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'welcome' }],
    });

    const result = await client.chat([], 'first message');

    expect(result).toBe('welcome');
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: 'user', content: 'first message' }],
      }),
    );
  });

  // -------------------------------------------------------------------------
  // chat() — error propagation
  // -------------------------------------------------------------------------

  it('throws when the API call returns an error (does not swallow)', async () => {
    const client = new SandboxLlmClient();
    const mockCreate = getMockCreate();
    const apiError = new Error('API rate limit exceeded');
    mockCreate.mockRejectedValueOnce(apiError);

    await expect(client.chat([], 'trigger error')).rejects.toThrow(
      'API rate limit exceeded',
    );
  });
});
