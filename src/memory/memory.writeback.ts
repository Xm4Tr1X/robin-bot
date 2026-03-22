import type { MemoryEntry } from '../contracts';
import type { MemoryService } from './memory.service';

export interface WritebackConfig {
  enabled: boolean;
  conversationId: string;
}

/**
 * Returns true if writeback is enabled for this config.
 */
export function shouldWriteback(config: WritebackConfig): boolean {
  return config.enabled;
}

/**
 * Writes a memory entry via the service and returns the created entry.
 */
export async function writeMemory(
  service: MemoryService,
  conversationId: string,
  kind: MemoryEntry['kind'],
  content: string,
): Promise<MemoryEntry> {
  return service.add({ conversationId, kind, content });
}
