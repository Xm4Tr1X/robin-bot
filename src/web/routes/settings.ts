import { Router } from 'express';
import { getConfig, readRawConfig, writeRawConfig } from '../../config';
import type { RobinConfigFile } from '../../config.types';

const ALLOWED_TOP_KEYS = ['features', 'options', 'settings'] as const;

function pickAllowed(body: unknown): Partial<RobinConfigFile> {
  if (typeof body !== 'object' || body === null) return {};
  const result: Record<string, unknown> = {};
  for (const key of ALLOWED_TOP_KEYS) {
    if (key in (body as object)) {
      result[key] = (body as Record<string, unknown>)[key];
    }
  }
  return result as Partial<RobinConfigFile>;
}

function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(override)) {
    if (v !== undefined) {
      if (
        typeof v === 'object' && v !== null && !Array.isArray(v) &&
        typeof result[k] === 'object' && result[k] !== null && !Array.isArray(result[k])
      ) {
        result[k] = deepMerge(result[k] as Record<string, unknown>, v as Record<string, unknown>);
      } else {
        // Arrays are replaced, not concatenated
        result[k] = v;
      }
    }
  }
  return result;
}

export function createSettingsRouter(): Router {
  const router = Router();

  // GET /api/settings — safe config only (no secrets, no env, no modelRouting)
  router.get('/', (_req, res) => {
    const { features, options, settings } = getConfig();
    res.json({ features, options, settings });
  });

  // POST /api/settings — allowlist-pick → deep-merge → write robin.json
  router.post('/', (req, res) => {
    const picked = pickAllowed(req.body);
    const current = readRawConfig() as Record<string, unknown>;
    const merged = deepMerge(current, picked as Record<string, unknown>);
    writeRawConfig(merged as RobinConfigFile);
    console.log('[robin:web] settings saved — restart to apply');
    res.json({ ok: true });
  });

  return router;
}
