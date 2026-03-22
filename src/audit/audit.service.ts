/**
 * AuditService — structured event emission for Robin.
 *
 * Responsibilities:
 *  - Build a fully-populated AuditEvent (required fields guaranteed).
 *  - Sanitise string metadata values through redactSecrets before storage/emit
 *    so secrets never appear in the audit log.
 *  - Persist events in-memory (for test inspection via getLog/clearLog).
 *  - Emit each event as a structured JSON line via console.warn.
 *
 * Usage:
 *   import { auditService } from '../audit/audit.service';
 *   auditService.emit({ event_type: 'access.denied', outcome: 'denied', ... });
 */

import { randomUUID } from 'node:crypto';
import type { AuditEvent, AuditOutcome } from '../contracts';
import { redactSecrets } from '../policy/redaction';
import type { AuditEventType } from './audit.types';

export interface AuditEmitParams {
  event_type: AuditEventType;
  actor_id?: string;
  correlation_id?: string;
  outcome: AuditOutcome;
  metadata?: Record<string, unknown>;
}

export class AuditService {
  private _log: AuditEvent[] = [];

  emit(params: AuditEmitParams): void {
    const event: AuditEvent = {
      event_type: params.event_type,
      actor_id: params.actor_id ?? 'system',
      timestamp: new Date().toISOString(),
      correlation_id: params.correlation_id ?? randomUUID(),
      outcome: params.outcome,
      ...(params.metadata !== undefined ? { metadata: this.sanitize(params.metadata) } : {}),
    };
    this._log.push(event);
    console.warn(JSON.stringify(event));
  }

  /** Returns a shallow copy of the log — mutations do not affect internal state. */
  getLog(): AuditEvent[] {
    return [...this._log];
  }

  clearLog(): void {
    this._log = [];
  }

  /** Redact all top-level string values in metadata before storage. */
  private sanitize(meta: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(meta)) {
      out[k] = typeof v === 'string' ? redactSecrets(v).redacted : v;
    }
    return out;
  }
}

/** Shared singleton — import this in all modules that emit audit events. */
export const auditService = new AuditService();
