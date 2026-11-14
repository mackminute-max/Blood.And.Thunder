import type { DeepReadonly, InitialConfiguration } from '../../contracts/initialization.ts';
import type { SignId } from '../../configuration/commands.ts';
export function signStrength(config: DeepReadonly<InitialConfiguration>, sign: SignId | null): number {
  if (!sign || sign === 'attack' && config.scenario.rules.competitionStyle === 'pure') return 0;
  const tuning = config.content.tuningProfiles.find(profile=>profile.id===config.scenario.tuningProfileId)!.ai.signInfluence;
  return tuning.globalStrength*tuning.perSign[sign];
}
