import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStore } from '../../../../src/store/memory.store.js';
import { MCPService } from '../../../../src/features/mcp/mcp.service.js';

describe('MCPService', () => {
  let store: MemoryStore;
  let svc: MCPService;

  beforeEach(() => {
    store = new MemoryStore();
    svc = new MCPService(store);
  });

  // ---------------------------------------------------------------------------
  // add()
  // ---------------------------------------------------------------------------

  describe('add()', () => {
    it('creates a connection with status=pending', () => {
      const c = svc.add('my-mcp', 'https://example.com/mcp');
      expect(c.status).toBe('pending');
      expect(c.name).toBe('my-mcp');
      expect(c.endpoint).toBe('https://example.com/mcp');
      expect(typeof c.id).toBe('string');
    });
  });

  // ---------------------------------------------------------------------------
  // validate()
  // ---------------------------------------------------------------------------

  describe('validate()', () => {
    it('validates a valid http endpoint → status=validated', () => {
      const c = svc.add('my-mcp', 'https://example.com/mcp');
      const updated = svc.validate(c.id);
      expect(updated?.status).toBe('validated');
      expect(updated?.validatedAt).toBeDefined();
    });

    it('fails a non-http endpoint → status=failed with lastError', () => {
      const c = svc.add('bad-mcp', 'ftp://bad-endpoint');
      const updated = svc.validate(c.id);
      expect(updated?.status).toBe('failed');
      expect(updated?.lastError).toBeTruthy();
    });

    it('returns undefined for unknown id', () => {
      expect(svc.validate('non-existent')).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // test()
  // ---------------------------------------------------------------------------

  describe('test()', () => {
    it('tests a validated connection → status=tested', () => {
      const c = svc.add('my-mcp', 'https://example.com/mcp');
      svc.validate(c.id);
      const updated = svc.test(c.id);
      expect(updated?.status).toBe('tested');
      expect(updated?.testedAt).toBeDefined();
    });

    it('fails if connection is not validated', () => {
      const c = svc.add('my-mcp', 'https://example.com/mcp');
      const updated = svc.test(c.id);
      expect(updated?.status).toBe('failed');
      expect(updated?.lastError).toContain('validated');
    });

    it('returns undefined for unknown id', () => {
      expect(svc.test('non-existent')).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // enable()
  // ---------------------------------------------------------------------------

  describe('enable()', () => {
    it('enables a tested connection → status=enabled', () => {
      const c = svc.add('my-mcp', 'https://example.com/mcp');
      svc.validate(c.id);
      svc.test(c.id);
      const updated = svc.enable(c.id);
      expect(updated?.status).toBe('enabled');
      expect(updated?.enabledAt).toBeDefined();
    });

    it('returns with lastError and does NOT persist if not tested', () => {
      const c = svc.add('my-mcp', 'https://example.com/mcp');
      svc.validate(c.id);
      const result = svc.enable(c.id);
      expect(result?.lastError).toBeTruthy();
      // Persisted status should still be 'validated', not 'enabled'
      const persisted = svc.getById(c.id);
      expect(persisted?.status).toBe('validated');
    });

    it('returns undefined for unknown id', () => {
      expect(svc.enable('non-existent')).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // disable()
  // ---------------------------------------------------------------------------

  describe('disable()', () => {
    it('sets status to disabled', () => {
      const c = svc.add('my-mcp', 'https://example.com/mcp');
      svc.validate(c.id);
      svc.test(c.id);
      svc.enable(c.id);
      const updated = svc.disable(c.id);
      expect(updated?.status).toBe('disabled');
    });

    it('returns undefined for unknown id', () => {
      expect(svc.disable('non-existent')).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // getEnabledConnections()
  // ---------------------------------------------------------------------------

  describe('getEnabledConnections()', () => {
    it('only returns enabled connections', () => {
      const c1 = svc.add('enabled-mcp', 'https://a.com/mcp');
      const c2 = svc.add('pending-mcp', 'https://b.com/mcp');
      svc.validate(c1.id);
      svc.test(c1.id);
      svc.enable(c1.id);
      const enabled = svc.getEnabledConnections();
      expect(enabled.every(c => c.status === 'enabled')).toBe(true);
      expect(enabled.some(c => c.id === c1.id)).toBe(true);
      expect(enabled.some(c => c.id === c2.id)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // format()
  // ---------------------------------------------------------------------------

  describe('format()', () => {
    it('returns _No MCP connections._ for empty array', () => {
      expect(svc.format([])).toBe('_No MCP connections._');
    });

    it('includes id slice, name, status, endpoint', () => {
      const c = svc.add('my-mcp', 'https://example.com/mcp');
      const output = svc.format([c]);
      expect(output).toContain(c.id.slice(0, 8));
      expect(output).toContain('my-mcp');
      expect(output).toContain('pending');
      expect(output).toContain('https://example.com/mcp');
    });
  });
});
