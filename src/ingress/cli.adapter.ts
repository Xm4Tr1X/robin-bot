/**
 * CLI ingress adapter.
 *
 * Bridges Node.js readline into the Robin IngressAdapter contract.
 * Does NOT call the LLM — it only normalises terminal input into
 * IngressEvent objects and forwards them to the provided onEvent callback.
 */

import { randomUUID } from 'node:crypto';
import * as readline from 'readline';
import type { IngressAdapter, IngressEvent } from '../contracts';

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

interface CliAdapterOptions {
  /** Identity to report as the actor. Defaults to 'owner'. */
  actorId?: string;
}

export class CliAdapter implements IngressAdapter {
  private readonly actorId: string;
  private rl: readline.Interface | null = null;

  constructor(options: CliAdapterOptions) {
    this.actorId = options.actorId ?? 'owner';
  }

  async start(onEvent: (event: IngressEvent) => Promise<void>): Promise<void> {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    this.rl.setPrompt('you: ');
    this.rl.prompt();

    this.rl.on('line', async (line: string) => {
      const text = line.trim();

      // Skip empty lines
      if (!text) return;

      const ingressEvent: IngressEvent = {
        id: randomUUID(),
        source: 'cli',
        actorId: this.actorId,
        conversationId: 'cli:local',
        text,
        ts: new Date().toISOString(),
      };

      try {
        await onEvent(ingressEvent);
      } catch (err) {
        console.error('[CliAdapter] onEvent error:', err);
      }

      // Re-prompt after each input (guard: rl may have closed if stdin was piped)
      try { this.rl?.prompt(); } catch { /* stdin closed */ }
    });
  }

  async stop(): Promise<void> {
    this.rl?.close();
  }
}
