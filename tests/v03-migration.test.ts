import { expect, it } from 'vitest';
import { fixture } from './setup-fixture.ts';
import { validateSetup } from '../src/configuration/validate.ts';
import { migrateV02Configuration } from '../src/persistence/migrate-v02.ts';
import { importConfiguration, exportConfiguration } from '../src/persistence/configuration.ts';
it('explicitly migrates portable v0.2 inputs with documented new defaults, preserving caller data',()=>{
  const f=fixture();const input={kind:'blood-thunder-configuration-a4-1',name:'Old fixture',mode:'race',...f,scenario:{...f.scenario,simulationVersion:'0.7.0'}};Reflect.deleteProperty(input.scenario.rules,'competitionStyle');for(const tuning of input.content.tuningProfiles){Reflect.deleteProperty(tuning,'attributes');Reflect.deleteProperty(tuning.ai,'signInfluence');}const before=JSON.stringify(input);
  const result=migrateV02Configuration(input);expect(result.scenario.simulationVersion).toBe('0.9.0');expect(result.scenario.rules.competitionStyle).toBe('combat');expect(result.content.tuningProfiles[0]!.ai.signInfluence.globalStrength).toBe(2);expect(result.content.tuningProfiles[0]!.attributes.durabilityPerPoint).toBe(.002);expect(result.scenario.entries).toEqual(validateSetup(f.scenario,f.content).scenario.entries);expect(JSON.stringify(input)).toBe(before);
  expect(importConfiguration(exportConfiguration(result))).toEqual(result);
  expect(()=>migrateV02Configuration({...input,kind:'a3-race-diagnostic'})).toThrow(/diagnostic histories/);expect(()=>migrateV02Configuration({...input,scenario:{...input.scenario,simulationVersion:'unknown'}})).toThrow(/Expected simulation/);
});
