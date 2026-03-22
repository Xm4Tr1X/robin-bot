/**
 * Ingress adapter contract re-exports.
 * Consumers of the ingress layer should import from here rather than
 * reaching into contracts.ts directly.
 */

export type { IngressAdapter, IngressEvent, IngressSource } from '../contracts';

/**
 * A channel-specific reply function passed into event handlers so adapters
 * can send responses without holding a reference to the full transport.
 *
 * @param text     - The reply text to send.
 * @param threadId - Optional thread/conversation identifier to reply into.
 */
export type ReplierFn = (text: string, threadId?: string) => Promise<void>;
