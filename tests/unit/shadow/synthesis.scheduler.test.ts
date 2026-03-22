/**
 * K4 — SynthesisScheduler tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock node-cron before importing scheduler
vi.mock('node-cron', () => ({
  default: { schedule: vi.fn() },
  schedule: vi.fn(),
}));

import * as cron from 'node-cron';
import { startSynthesisScheduler } from '../../../src/shadow/synthesis.scheduler.js';
import type { ActivityService } from '../../../src/shadow/activity.service.js';
import type { MemoryService } from '../../../src/memory/memory.service.js';
import type { PatternSynthesizer } from '../../../src/shadow/pattern.synthesizer.js';

function makeActivityService(records = [{ id: 'a1', text: 'some activity', ts: '1', channelId: 'C1', actorId: 'U1', createdAt: new Date().toISOString() }]) {
  return { listRecent: vi.fn().mockReturnValue(records) } as unknown as ActivityService;
}

function makeMemoryService() {
  return {
    addGlobal: vi.fn().mockReturnValue({ id: 'm1' }),
    getGlobal: vi.fn().mockReturnValue([]),
  } as unknown as MemoryService;
}

function makeSynthesizer(result = { preferences: ['pref A'], patterns: ['pattern B'], noChange: false }) {
  return { synthesize: vi.fn().mockResolvedValue(result) } as unknown as PatternSynthesizer;
}

describe('K4: SynthesisScheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('schedules a cron job with the provided schedule string', () => {
    const activityService = makeActivityService();
    const memoryService = makeMemoryService();
    const synthesizer = makeSynthesizer({ preferences: [], patterns: [], noChange: true });

    startSynthesisScheduler({
      activityService,
      memoryService,
      synthesizer,
      schedule: '0 2 * * *',
    });

    expect(cron.schedule).toHaveBeenCalledWith('0 2 * * *', expect.any(Function));
  });

  it('calls activityService.listRecent(batchSize) on tick', async () => {
    const activityService = makeActivityService();
    const memoryService = makeMemoryService();
    const synthesizer = makeSynthesizer({ preferences: [], patterns: [], noChange: true });

    vi.mocked(cron.schedule).mockImplementation((_schedule, cb) => {
      (cb as () => void)();
      return {} as never;
    });

    startSynthesisScheduler({
      activityService,
      memoryService,
      synthesizer,
      schedule: '0 2 * * *',
      batchSize: 25,
    });

    // Give async tick time to complete
    await new Promise((r) => setTimeout(r, 10));

    expect(activityService.listRecent).toHaveBeenCalledWith(25);
  });

  it('defaults batchSize to 50 when not configured', async () => {
    const activityService = makeActivityService();
    const memoryService = makeMemoryService();
    const synthesizer = makeSynthesizer({ preferences: [], patterns: [], noChange: true });

    vi.mocked(cron.schedule).mockImplementation((_schedule, cb) => {
      (cb as () => void)();
      return {} as never;
    });

    startSynthesisScheduler({ activityService, memoryService, synthesizer, schedule: '* * * * *' });

    await new Promise((r) => setTimeout(r, 10));
    expect(activityService.listRecent).toHaveBeenCalledWith(50);
  });

  it('writes new preferences and patterns to global memory when noChange is false', async () => {
    const activityService = makeActivityService();
    const memoryService = makeMemoryService();
    const synthesizer = makeSynthesizer({
      preferences: ['pref A'],
      patterns: ['pattern B'],
      noChange: false,
    });

    vi.mocked(cron.schedule).mockImplementation((_schedule, cb) => {
      (cb as () => void)();
      return {} as never;
    });

    startSynthesisScheduler({ activityService, memoryService, synthesizer, schedule: '* * * * *' });
    await new Promise((r) => setTimeout(r, 10));

    expect(memoryService.addGlobal).toHaveBeenCalledWith('preference', 'pref A');
    expect(memoryService.addGlobal).toHaveBeenCalledWith('behavioral_pattern', 'pattern B');
  });

  it('skips memory writes when noChange is true', async () => {
    const activityService = makeActivityService();
    const memoryService = makeMemoryService();
    const synthesizer = makeSynthesizer({ preferences: [], patterns: [], noChange: true });

    vi.mocked(cron.schedule).mockImplementation((_schedule, cb) => {
      (cb as () => void)();
      return {} as never;
    });

    startSynthesisScheduler({ activityService, memoryService, synthesizer, schedule: '* * * * *' });
    await new Promise((r) => setTimeout(r, 10));

    expect(memoryService.addGlobal).not.toHaveBeenCalled();
  });

  it('does not crash when synthesizer throws — scheduler continues', async () => {
    const activityService = makeActivityService();
    const memoryService = makeMemoryService();
    const synthesizer = { synthesize: vi.fn().mockRejectedValue(new Error('LLM down')) } as unknown as PatternSynthesizer;

    vi.mocked(cron.schedule).mockImplementation((_schedule, cb) => {
      (cb as () => void)();
      return {} as never;
    });

    await expect(
      new Promise<void>((resolve) => {
        startSynthesisScheduler({ activityService, memoryService, synthesizer, schedule: '* * * * *' });
        setTimeout(resolve, 20);
      }),
    ).resolves.toBeUndefined();
  });
});
