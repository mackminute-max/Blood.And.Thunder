import type { SignId } from '../../configuration/commands.ts';
/** Integrate the secondary multiplier across fractional line crossings, not utility strength. */
export function signExposureForTick(rus: Record<string, { activeSignId: SignId | null }>, pushMultiplier: number) {
  const factor = (sign: SignId | null) => sign === 'push-hard' ? pushMultiplier : 1;
  const periods = new Map(Object.entries(rus).map(([id,ru])=>[id,{ fraction: 0, multiplier: factor(ru.activeSignId), accumulated: 0 }]));
  return {
    crossing(id: string, fraction: number, sign: SignId | null) {
      const period = periods.get(id)!;
      period.accumulated += Math.max(0,fraction-period.fraction)*period.multiplier;
      period.fraction = fraction; period.multiplier = factor(sign);
    },
    values: () => new Map([...periods].map(([id,p])=>[id,p.accumulated+(1-p.fraction)*p.multiplier])),
  };
}
