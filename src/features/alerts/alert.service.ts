import { randomUUID } from 'node:crypto';
import type { DurableStore } from '../../store/store.contract';
import type { AlertRecord, AlertTriage, AlertStatus, AlertChannelProfile } from './alert.types';

const ALERT_TABLE = 'alerts';
const PROFILE_TABLE = 'alert_profiles';

export class AlertService {
  constructor(private store: DurableStore) {}

  ingest(channelId: string, text: string, ts: string, triage: AlertTriage): AlertRecord {
    const now = new Date().toISOString();
    const alert: AlertRecord = {
      id: randomUUID(),
      channelId,
      text,
      ts,
      triage,
      status: 'open',
      createdAt: now,
      updatedAt: now,
    };
    this.store.upsert(ALERT_TABLE, alert);
    return alert;
  }

  transition(id: string, status: AlertStatus): AlertRecord | undefined {
    const existing = this.store.get<AlertRecord>(ALERT_TABLE, id);
    if (!existing) return undefined;
    const updated: AlertRecord = { ...existing, status, updatedAt: new Date().toISOString() };
    this.store.upsert(ALERT_TABLE, updated);
    return updated;
  }

  setDraft(id: string, draft: string): AlertRecord | undefined {
    const existing = this.store.get<AlertRecord>(ALERT_TABLE, id);
    if (!existing) return undefined;
    const updated: AlertRecord = {
      ...existing,
      draftArtifact: draft,
      updatedAt: new Date().toISOString(),
    };
    this.store.upsert(ALERT_TABLE, updated);
    return updated;
  }

  listOpen(): AlertRecord[] {
    return this.store.list<AlertRecord>(ALERT_TABLE, { where: { status: 'open' } });
  }

  listAll(): AlertRecord[] {
    return this.store.list<AlertRecord>(ALERT_TABLE);
  }

  addChannelProfile(channelId: string, keywords: string[]): AlertChannelProfile {
    const profile: AlertChannelProfile = {
      id: channelId,
      channelId,
      enabled: true,
      keywords: JSON.stringify(keywords),
      createdAt: new Date().toISOString(),
    };
    this.store.upsert(PROFILE_TABLE, profile);
    return profile;
  }

  removeChannelProfile(channelId: string): boolean {
    return this.store.delete(PROFILE_TABLE, channelId);
  }

  getChannelProfile(channelId: string): AlertChannelProfile | undefined {
    return this.store.get<AlertChannelProfile>(PROFILE_TABLE, channelId);
  }

  listProfiles(): AlertChannelProfile[] {
    return this.store.list<AlertChannelProfile>(PROFILE_TABLE);
  }

  isChannelMonitored(channelId: string): boolean {
    const profile = this.getChannelProfile(channelId);
    return profile?.enabled === true;
  }

  classifyTriage(text: string, profile: AlertChannelProfile): AlertTriage {
    const keywords = JSON.parse(profile.keywords) as string[];
    const hasKeywordMatch = keywords.some(kw =>
      text.toLowerCase().includes(kw.toLowerCase()),
    );
    if (!hasKeywordMatch) return 'noise';
    if (/\b(critical|outage|down|p0|sev0|sev1|sev-1)\b/i.test(text)) return 'critical';
    if (/\b(error|warning|degraded|slow|high|spike)\b/i.test(text)) return 'investigate';
    return 'noise';
  }

  format(alerts: AlertRecord[]): string {
    if (alerts.length === 0) return '_No alerts._';
    return alerts
      .map(
        a =>
          `• \`${a.id.slice(0, 8)}\` [${a.triage}/${a.status}] ${a.text.slice(0, 80)} — ${a.channelId}`,
      )
      .join('\n');
  }
}
