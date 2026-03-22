import { randomUUID } from 'node:crypto';
import type { DurableStore } from '../../store/store.contract';
import type { MCPConnection } from './mcp.types';
import { auditService } from '../../audit/audit.service';

const TABLE = 'mcp_connections';

export class MCPService {
  constructor(private store: DurableStore) {}

  add(name: string, endpoint: string): MCPConnection {
    const conn: MCPConnection = {
      id: randomUUID(),
      name,
      endpoint,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    this.store.upsert(TABLE, conn);
    return conn;
  }

  validate(id: string): MCPConnection | undefined {
    const conn = this.store.get<MCPConnection>(TABLE, id);
    if (!conn) return undefined;
    const isValid = conn.endpoint.startsWith('http');
    const updated: MCPConnection = {
      ...conn,
      status: isValid ? 'validated' : 'failed',
      validatedAt: new Date().toISOString(),
      lastError: isValid ? undefined : 'Endpoint must start with http',
    };
    this.store.upsert(TABLE, updated);
    auditService.emit({
      event_type: 'mcp.action',
      outcome: updated.status === 'validated' ? 'allowed' : 'denied',
      metadata: { action: 'validate', id, name: conn.name, status: updated.status },
    });
    return updated;
  }

  test(id: string): MCPConnection | undefined {
    const conn = this.store.get<MCPConnection>(TABLE, id);
    if (!conn) return undefined;
    if (conn.status !== 'validated') {
      const updated: MCPConnection = {
        ...conn,
        status: 'failed',
        lastError: 'Must be validated before testing',
      };
      this.store.upsert(TABLE, updated);
      auditService.emit({
        event_type: 'mcp.action',
        outcome: 'denied',
        metadata: { action: 'test', id, name: conn.name, status: 'failed' },
      });
      return updated;
    }
    const updated: MCPConnection = {
      ...conn,
      status: 'tested',
      testedAt: new Date().toISOString(),
    };
    this.store.upsert(TABLE, updated);
    auditService.emit({
      event_type: 'mcp.action',
      outcome: 'allowed',
      metadata: { action: 'test', id, name: conn.name, status: 'tested' },
    });
    return updated;
  }

  enable(id: string): MCPConnection | undefined {
    const conn = this.store.get<MCPConnection>(TABLE, id);
    if (!conn) return undefined;
    if (conn.status !== 'tested') {
      // Return with error info but do NOT persist the change
      auditService.emit({
        event_type: 'mcp.action',
        outcome: 'denied',
        metadata: { action: 'enable', id, name: conn.name, status: conn.status },
      });
      return { ...conn, lastError: 'Must be tested before enabling' };
    }
    const updated: MCPConnection = {
      ...conn,
      status: 'enabled',
      enabledAt: new Date().toISOString(),
    };
    this.store.upsert(TABLE, updated);
    auditService.emit({
      event_type: 'mcp.action',
      outcome: 'allowed',
      metadata: { action: 'enable', id, name: conn.name, status: 'enabled' },
    });
    return updated;
  }

  disable(id: string): MCPConnection | undefined {
    const conn = this.store.get<MCPConnection>(TABLE, id);
    if (!conn) return undefined;
    const updated: MCPConnection = { ...conn, status: 'disabled' };
    this.store.upsert(TABLE, updated);
    auditService.emit({
      event_type: 'mcp.action',
      outcome: 'allowed',
      metadata: { action: 'disable', id, name: conn.name, status: 'disabled' },
    });
    return updated;
  }

  listAll(): MCPConnection[] {
    return this.store.list<MCPConnection>(TABLE);
  }

  getById(id: string): MCPConnection | undefined {
    return this.store.get<MCPConnection>(TABLE, id);
  }

  getEnabledConnections(): MCPConnection[] {
    return this.store.list<MCPConnection>(TABLE, { where: { status: 'enabled' } });
  }

  format(connections: MCPConnection[]): string {
    if (connections.length === 0) return '_No MCP connections._';
    return connections
      .map(c => `• \`${c.id.slice(0, 8)}\` *${c.name}* [${c.status}] ${c.endpoint}`)
      .join('\n');
  }
}
