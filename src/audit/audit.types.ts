/**
 * Audit event type discriminator for Phase I structured observability.
 * All audit events emitted by Robin use one of these event_type values.
 */
export type AuditEventType =
  | 'access.denied'
  | 'mode.changed'
  | 'mcp.action'
  | 'comms.draft.generated'
  | 'runner.telemetry';
