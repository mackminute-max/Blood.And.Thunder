import { expect, it } from 'vitest';
import { fixture } from './setup-fixture.ts';
import { previewBulkEdit } from '../src/configuration/bulk-edit.ts';
import { validateSetup } from '../src/configuration/validate.ts';
it('sets every beast on every RU and preserves identity and unrelated values',()=>{
  const f=fixture();const before=JSON.stringify(f);const result=previewBulkEdit(f,'beasts.speed',85);
  expect(result.changes).toHaveLength(f.scenario.entries.reduce((sum,e)=>sum+e.beastIds.length,0));
  for(const entry of result.configuration.scenario.entries)for(const id of entry.beastIds)expect(result.configuration.content.beasts.find(b=>b.id===id)!.speed).toBe(85);
  expect(result.configuration.scenario.entries).toEqual(validateSetup(f.scenario,f.content).scenario.entries);
  expect(result.configuration.content.tracks).toEqual(validateSetup(f.scenario,f.content).content.tracks);expect(JSON.stringify(f)).toBe(before);
});
it('bulk nested driver and scenario strategy edits persist and invalid operations reject atomically',()=>{
  const f=fixture();const before=JSON.stringify(f);
  const result=previewBulkEdit(f,'driver.personality.discipline',40);
  for(const entry of f.scenario.entries)expect(result.configuration.content.drivers.find(d=>d.id===entry.driverId)!.personality.discipline).toBe(40);
  expect(previewBulkEdit(f,'entry.preRaceStrategy','endurance').configuration.scenario.entries.every(e=>e.preRaceStrategy==='endurance')).toBe(true);
  for(const [field,value] of [['beasts.speed',101],['driver.currentHealth',10000],['driver.__proto__',1],['track.severity',1],['entry.preRaceStrategy','invalid']] as const)expect(()=>previewBulkEdit(f,field,value)).toThrow();
  expect(JSON.stringify(f)).toBe(before);
});
