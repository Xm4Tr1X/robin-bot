import { schedule } from 'node-cron';
import type { ActivityService } from './activity.service';
import type { MemoryService } from '../memory/memory.service';
import type { PatternSynthesizer } from './pattern.synthesizer';

const DEFAULT_BATCH_SIZE = 50;

export interface SynthesisSchedulerConfig {
  activityService: ActivityService;
  memoryService: MemoryService;
  synthesizer: PatternSynthesizer;
  schedule: string;
  batchSize?: number;
}

export function startSynthesisScheduler(config: SynthesisSchedulerConfig): void {
  const batchSize = config.batchSize ?? DEFAULT_BATCH_SIZE;

  schedule(config.schedule, async () => {
    try {
      const recent = config.activityService.listRecent(batchSize);
      const existingGlobal = config.memoryService.getGlobal().map((e) => e.content);

      const result = await config.synthesizer.synthesize(recent, existingGlobal);

      if (result.noChange) return;

      for (const pref of result.preferences) {
        config.memoryService.addGlobal('preference', pref);
      }
      for (const pattern of result.patterns) {
        config.memoryService.addGlobal('behavioral_pattern', pattern);
      }
    } catch (err) {
      console.error('[SynthesisScheduler] tick error:', err);
    }
  });
}
