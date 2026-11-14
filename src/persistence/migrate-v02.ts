import { copyJson } from '../shared/immutable.ts';
import { validateSavedConfiguration } from './configuration.ts';
/** Explicit scenario migration only. Never relabel/replay historical diagnostics. */
export function migrateV02Configuration(input: unknown) {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Expected a portable v0.2 configuration');
  const source=copyJson(input) as Record<string,unknown>;
  if(source.kind!=='blood-thunder-configuration-a4-1'||!source.scenario||typeof source.scenario!=='object'||Array.isArray(source.scenario))throw new Error('Only portable configuration files can migrate; diagnostic histories cannot');
  const scenario=source.scenario as Record<string,unknown>;
  if(scenario.simulationVersion!=='0.7.0'||scenario.schemaVersion!=='c2-1')throw new Error('Expected simulation 0.7.0 / schema c2-1');
  scenario.simulationVersion='0.8.0';
  return validateSavedConfiguration(source);
}
