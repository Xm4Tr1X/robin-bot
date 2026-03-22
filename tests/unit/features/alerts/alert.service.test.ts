import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStore } from '../../../../src/store/memory.store.js';
import { AlertService } from '../../../../src/features/alerts/alert.service.js';

describe('AlertService', () => {
  let store: MemoryStore;
  let svc: AlertService;

  beforeEach(() => {
    store = new MemoryStore();
    svc = new AlertService(store);
  });

  // ---------------------------------------------------------------------------
  // ingest()
  // ---------------------------------------------------------------------------

  describe('ingest()', () => {
    it('creates an alert with status=open', () => {
      const a = svc.ingest('C_ALERTS', 'Service is down', '1234.5', 'critical');
      expect(a.status).toBe('open');
    });

    it('stores the given triage', () => {
      const a = svc.ingest('C_ALERTS', 'High memory usage', '1234.5', 'investigate');
      expect(a.triage).toBe('investigate');
    });

    it('generates a unique id', () => {
      const a1 = svc.ingest('C_ALERTS', 'Alert 1', '1.0', 'noise');
      const a2 = svc.ingest('C_ALERTS', 'Alert 2', '2.0', 'noise');
      expect(a1.id).not.toBe(a2.id);
    });

    it('sets ISO timestamps', () => {
      const before = new Date().toISOString();
      const a = svc.ingest('C_ALERTS', 'Alert', '1.0', 'noise');
      const after = new Date().toISOString();
      expect(a.createdAt >= before).toBe(true);
      expect(a.createdAt <= after).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // transition()
  // ---------------------------------------------------------------------------

  describe('transition()', () => {
    it('updates status to acked', () => {
      const a = svc.ingest('C_ALERTS', 'Alert', '1.0', 'critical');
      const updated = svc.transition(a.id, 'acked');
      expect(updated?.status).toBe('acked');
    });

    it('updates status to resolved', () => {
      const a = svc.ingest('C_ALERTS', 'Alert', '1.0', 'critical');
      const updated = svc.transition(a.id, 'resolved');
      expect(updated?.status).toBe('resolved');
    });

    it('returns undefined for unknown id', () => {
      expect(svc.transition('non-existent', 'acked')).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // setDraft()
  // ---------------------------------------------------------------------------

  describe('setDraft()', () => {
    it('stores the draft artifact', () => {
      const a = svc.ingest('C_ALERTS', 'Alert', '1.0', 'critical');
      const updated = svc.setDraft(a.id, 'Here is my response plan...');
      expect(updated?.draftArtifact).toBe('Here is my response plan...');
    });

    it('returns undefined for unknown id', () => {
      expect(svc.setDraft('non-existent', 'draft')).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // listOpen() / listAll()
  // ---------------------------------------------------------------------------

  describe('listOpen()', () => {
    it('only returns open alerts', () => {
      const a1 = svc.ingest('C_ALERTS', 'Alert 1', '1.0', 'critical');
      const a2 = svc.ingest('C_ALERTS', 'Alert 2', '2.0', 'noise');
      svc.transition(a1.id, 'resolved');
      const open = svc.listOpen();
      expect(open.every(a => a.status === 'open')).toBe(true);
      expect(open.some(a => a.id === a2.id)).toBe(true);
      expect(open.some(a => a.id === a1.id)).toBe(false);
    });
  });

  describe('listAll()', () => {
    it('returns all alerts regardless of status', () => {
      const a1 = svc.ingest('C_ALERTS', 'Alert 1', '1.0', 'critical');
      const a2 = svc.ingest('C_ALERTS', 'Alert 2', '2.0', 'noise');
      svc.transition(a1.id, 'resolved');
      expect(svc.listAll().length).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // Channel profiles
  // ---------------------------------------------------------------------------

  describe('addChannelProfile()', () => {
    it('creates a profile with enabled=true and JSON-encoded keywords', () => {
      const p = svc.addChannelProfile('C_OPS', ['outage', 'down']);
      expect(p.enabled).toBe(true);
      expect(JSON.parse(p.keywords)).toEqual(['outage', 'down']);
    });
  });

  describe('removeChannelProfile()', () => {
    it('removes an existing profile and returns true', () => {
      svc.addChannelProfile('C_OPS', ['outage']);
      expect(svc.removeChannelProfile('C_OPS')).toBe(true);
      expect(svc.getChannelProfile('C_OPS')).toBeUndefined();
    });

    it('returns false for a non-existent profile', () => {
      expect(svc.removeChannelProfile('C_MISSING')).toBe(false);
    });
  });

  describe('isChannelMonitored()', () => {
    it('returns true for an enabled profile', () => {
      svc.addChannelProfile('C_OPS', ['outage']);
      expect(svc.isChannelMonitored('C_OPS')).toBe(true);
    });

    it('returns false for a missing profile', () => {
      expect(svc.isChannelMonitored('C_MISSING')).toBe(false);
    });

    it('returns false for a disabled profile', () => {
      const p = svc.addChannelProfile('C_OPS', ['outage']);
      store.upsert('alert_profiles', { ...p, enabled: false });
      expect(svc.isChannelMonitored('C_OPS')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // classifyTriage()
  // ---------------------------------------------------------------------------

  describe('classifyTriage()', () => {
    const profile = {
      id: 'C_OPS',
      channelId: 'C_OPS',
      enabled: true,
      keywords: JSON.stringify(['outage', 'alert']),
      createdAt: new Date().toISOString(),
    };

    it('returns critical when keyword + critical word match', () => {
      expect(svc.classifyTriage('Service outage — P0 down', profile)).toBe('critical');
    });

    it('returns investigate when keyword + warning-level word match', () => {
      expect(svc.classifyTriage('alert: high memory usage spike', profile)).toBe('investigate');
    });

    it('returns noise when keyword matches but no severity word', () => {
      expect(svc.classifyTriage('scheduled maintenance alert', profile)).toBe('noise');
    });

    it('returns noise when no keyword matches', () => {
      expect(svc.classifyTriage('all systems normal', profile)).toBe('noise');
    });
  });

  // ---------------------------------------------------------------------------
  // format()
  // ---------------------------------------------------------------------------

  describe('format()', () => {
    it('returns _No alerts._ for empty array', () => {
      expect(svc.format([])).toBe('_No alerts._');
    });

    it('includes id slice, triage, status, text, channelId', () => {
      const a = svc.ingest('C_OPS', 'Service is down', '1.0', 'critical');
      const output = svc.format([a]);
      expect(output).toContain(a.id.slice(0, 8));
      expect(output).toContain('critical');
      expect(output).toContain('open');
      expect(output).toContain('C_OPS');
    });
  });
});
