import type { DeepReadonly, InitialConfiguration } from '../../contracts/initialization.ts';
import type { DerivedStats } from '../../contracts/movement.ts';
export const performanceStats = ['maxSpeedMps', 'accelMps2', 'brakeMps2', 'handling', 'stability', 'endurance'] as const;
/** Deterministic equipment-modifier boundary: provisioned driver/cart items, once per ID. */
export function equipmentModifiers(config: DeepReadonly<InitialConfiguration>, ruId: string): Pick<DerivedStats, typeof performanceStats[number]> {
  const entry = config.scenario.entries.find(e => e.id === ruId)!;
  const cart = config.content.chariots.find(c => c.id === entry.chariotId)!;
  const ids = [...new Set([...entry.weaponIds, ...cart.equipmentIds])].sort();
  const result = { maxSpeedMps: 0, accelMps2: 0, brakeMps2: 0, handling: 0, stability: 0, endurance: 0 };
  for (const id of ids) {
    const item = config.content.weapons.find(w => w.id === id)!;
    for (const stat of performanceStats) result[stat] += item.statModifiers[stat];
  }
  return result;
}
