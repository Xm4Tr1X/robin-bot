// Sandbox mode: context-free LLM chat
// No memory, no policy, no tools, no Slack
// Just a raw conversation with Claude

import * as readline from 'readline';
import { SandboxLlmClient, Message } from './llm.client';

const BANNER = [
  'robin sandbox — direct LLM chat (no pipeline, no tools)',
  'Type your message and press Enter. Ctrl+C to quit.',
  '',
].join('\n');

async function main(): Promise<void> {
  console.log(BANNER);

  const client = new SandboxLlmClient();
  const history: Message[] = [];

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  process.on('SIGINT', () => {
    console.log('\nrobin sandbox shutting down.');
    rl.close();
    process.exit(0);
  });

  const prompt = (): void => {
    rl.question('you: ', async (input: string) => {
      const trimmed = input.trim();

      if (!trimmed) {
        prompt();
        return;
      }

      try {
        const response = await client.chat(history, trimmed);
        history.push({ role: 'user', content: trimmed });
        history.push({ role: 'assistant', content: response });
        console.log(`robin: ${response}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`Error: ${message}`);
      }

      prompt();
    });
  };

  prompt();
}

main();
