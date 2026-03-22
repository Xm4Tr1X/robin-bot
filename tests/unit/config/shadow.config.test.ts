/**
 * J1 — Shadow channel config tests.
 * Tests that shadowChannels is present in RobinConfigFile.settings
 * and RobinConfigResolved.settings, defaults to [], and round-trips
 * through readRawConfig / writeRawConfig.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';

// We exercise the real module logic by resetting the module cache
// and mocking fs per test.
vi.mock('fs');

describe('J1: shadowChannels config', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readFileSync).mockReturnValue('{}');
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('default value', () => {
    it('defaults shadowChannels to [] when absent from robin.json', async () => {
      const { loadConfig } = await import('../../../src/config.js');
      const cfg = loadConfig();
      expect(cfg.settings.shadowChannels).toEqual([]);
    });

    it('defaults shadowChannels to [] when settings block is absent', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ features: {} }));
      const { loadConfig } = await import('../../../src/config.js');
      const cfg = loadConfig();
      expect(cfg.settings.shadowChannels).toEqual([]);
    });
  });

  describe('round-trip through readRawConfig / writeRawConfig', () => {
    it('reads shadowChannels from robin.json when present', async () => {
      const rawConfig = {
        settings: { shadowChannels: ['C012345', 'C067890'] },
      };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(rawConfig));

      const { readRawConfig } = await import('../../../src/config.js');
      const raw = readRawConfig();
      expect(raw.settings?.shadowChannels).toEqual(['C012345', 'C067890']);
    });

    it('writes shadowChannels to disk and other keys are preserved', async () => {
      let written = '';
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ settings: { ownerUserId: 'U999' } }),
      );
      vi.mocked(fs.writeFileSync).mockImplementation((_p, data) => {
        written = data as string;
      });

      const { writeRawConfig } = await import('../../../src/config.js');
      writeRawConfig({
        settings: { ownerUserId: 'U999', shadowChannels: ['C111'] },
      });

      const parsed = JSON.parse(written);
      expect(parsed.settings.shadowChannels).toEqual(['C111']);
      expect(parsed.settings.ownerUserId).toBe('U999');
    });

    it('writes empty shadowChannels array without omitting the key', async () => {
      let written = '';
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{}');
      vi.mocked(fs.writeFileSync).mockImplementation((_p, data) => {
        written = data as string;
      });

      const { writeRawConfig } = await import('../../../src/config.js');
      writeRawConfig({ settings: { shadowChannels: [] } });

      const parsed = JSON.parse(written);
      expect(parsed.settings).toHaveProperty('shadowChannels');
      expect(parsed.settings.shadowChannels).toEqual([]);
    });
  });

  describe('resolved config picks up shadowChannels from file', () => {
    it('resolves shadowChannels from settings block', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ settings: { shadowChannels: ['CABC', 'CDEF'] } }),
      );
      const { loadConfig } = await import('../../../src/config.js');
      const cfg = loadConfig();
      expect(cfg.settings.shadowChannels).toEqual(['CABC', 'CDEF']);
    });

    it('ignores non-string entries in shadowChannels', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ settings: { shadowChannels: ['C123', 42, null, 'C456'] } }),
      );
      const { loadConfig } = await import('../../../src/config.js');
      const cfg = loadConfig();
      // Only valid string channel IDs should survive
      expect(cfg.settings.shadowChannels).toEqual(['C123', 'C456']);
    });
  });
});
