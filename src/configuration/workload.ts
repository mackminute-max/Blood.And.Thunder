import type { DeepReadonly, InitialConfiguration } from '../contracts/initialization.ts';
export const MAX_BATCH_RU_TICKS = 10_000_000;
/** Preflight work, not elapsed wall time: deterministic and independent of machine speed. */
export function assertBatchWorkload(configs: readonly DeepReadonly<InitialConfiguration>[], seedCount: number) {
  const work = configs.reduce((sum,c)=>sum+c.scenario.entries.length*(c.scenario.rules.maxTicks+c.scenario.rules.countdownTicks),0)*seedCount;
  if (!Number.isSafeInteger(work) || seedCount < 1 || work > MAX_BATCH_RU_TICKS) throw new Error(`Batch exceeds ${MAX_BATCH_RU_TICKS} RU-tick workload limit; reduce seeds, roster or tick horizon`);
  return work;
}
