import type { DeepReadonly, InitialConfiguration } from '../../contracts/initialization.ts';
/** Mean attached-beast environmental multipliers; no modifiers means identity. */
export function traitFactors(config: DeepReadonly<InitialConfiguration>, ruId?: string) {
  const modifiers = config.content.tuningProfiles.find(t => t.id === config.scenario.tuningProfileId)!.environment.traitModifiers;
  const entry = config.scenario.entries.find(e => e.id === ruId);
  if (!entry || !modifiers.length) return { traction: 1, fatigue: 1 };
  const factors = entry.beastIds.map(id => {
    const beast = config.content.beasts.find(b => b.id === id)!;
    return modifiers.filter(m => beast.traits.includes(m.traitId) && m.weatherIds.includes(config.scenario.weatherId)).reduce((result, m) => ({ traction: result.traction * m.tractionMultiplier, fatigue: result.fatigue * m.fatigueMultiplier }), { traction: 1, fatigue: 1 });
  });
  return { traction: factors.reduce((sum, f) => sum + f.traction, 0) / factors.length, fatigue: factors.reduce((sum, f) => sum + f.fatigue, 0) / factors.length };
}
