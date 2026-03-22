import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock config helpers so tests don't touch the real filesystem or resolved config
vi.mock('../../../src/config.js', () => ({
  getConfig: vi.fn(() => ({
    features: {
      slackEnabled: true,
      checkInsEnabled: true,
      ownerApprovalRequired: false,
      sandboxEnabled: false,
      redactionBeforeSend: false,
    },
    options: { defaultMode: 'observe' },
    settings: {
      snapshotDir: './snapshots',
      dbPath: './data/robin.db',
      ownerUserId: 'U123',
      checkinChannel: '',
      maxTurns: 10,
      allowedTools: ['Read', 'Bash'],
      webPort: 3000,
    },
  })),
  readRawConfig: vi.fn(() => ({})),
  writeRawConfig: vi.fn(),
}));

import { createSettingsRouter } from '../../../src/web/routes/settings.js';
import * as config from '../../../src/config.js';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/', createSettingsRouter());
  return app;
}

beforeEach(() => {
  vi.mocked(config.readRawConfig).mockReturnValue({});
  vi.mocked(config.writeRawConfig).mockReset();
});

describe('GET /api/settings', () => {
  it('returns features, options, and settings', async () => {
    const res = await request(buildApp()).get('/');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('features');
    expect(res.body).toHaveProperty('options');
    expect(res.body).toHaveProperty('settings');
  });

  it('never exposes secrets or modelRouting', async () => {
    const res = await request(buildApp()).get('/');
    expect(res.body).not.toHaveProperty('secrets');
    expect(res.body).not.toHaveProperty('modelRouting');
    expect(res.body).not.toHaveProperty('env');
  });

  it('includes known feature flags', async () => {
    const res = await request(buildApp()).get('/');
    expect(res.body.features.slackEnabled).toBe(true);
    expect(res.body.features.checkInsEnabled).toBe(true);
  });
});

describe('POST /api/settings', () => {
  it('saves allowed top-level keys to disk', async () => {
    const res = await request(buildApp())
      .post('/')
      .send({ features: { slackEnabled: false } });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(config.writeRawConfig).toHaveBeenCalledOnce();
    const written = vi.mocked(config.writeRawConfig).mock.calls[0][0];
    expect(written).toHaveProperty('features');
    expect((written as Record<string, unknown>).features).toMatchObject({ slackEnabled: false });
  });

  it('deep-merges with existing config on disk', async () => {
    vi.mocked(config.readRawConfig).mockReturnValue({
      features: { slackEnabled: true, checkInsEnabled: true },
      settings: { ownerUserId: 'U999' },
    });

    await request(buildApp())
      .post('/')
      .send({ features: { slackEnabled: false } });

    const written = vi.mocked(config.writeRawConfig).mock.calls[0][0] as Record<string, unknown>;
    const features = written.features as Record<string, unknown>;
    // slackEnabled updated, checkInsEnabled preserved
    expect(features.slackEnabled).toBe(false);
    expect(features.checkInsEnabled).toBe(true);
  });

  it('silently drops secrets key — never reaches disk', async () => {
    await request(buildApp())
      .post('/')
      .send({ secrets: { slackBotToken: 'LEAK' }, features: { slackEnabled: true } });

    const written = vi.mocked(config.writeRawConfig).mock.calls[0][0];
    expect(written).not.toHaveProperty('secrets');
  });

  it('silently drops modelRouting key', async () => {
    await request(buildApp())
      .post('/')
      .send({ modelRouting: { enabled: true } });

    const written = vi.mocked(config.writeRawConfig).mock.calls[0][0];
    expect(written).not.toHaveProperty('modelRouting');
  });

  it('silently drops env key', async () => {
    await request(buildApp())
      .post('/')
      .send({ env: { SECRET: 'leak' }, settings: { maxTurns: 20 } });

    const written = vi.mocked(config.writeRawConfig).mock.calls[0][0];
    expect(written).not.toHaveProperty('env');
    expect((written as Record<string, unknown>).settings).toMatchObject({ maxTurns: 20 });
  });

  it('replaces arrays (not concatenates) when settings.allowedTools is sent', async () => {
    vi.mocked(config.readRawConfig).mockReturnValue({
      settings: { allowedTools: ['Read', 'Bash'] },
    });

    await request(buildApp())
      .post('/')
      .send({ settings: { allowedTools: ['Read'] } });

    const written = vi.mocked(config.writeRawConfig).mock.calls[0][0] as Record<string, unknown>;
    const settings = written.settings as Record<string, unknown>;
    expect(settings.allowedTools).toEqual(['Read']);
  });
});
