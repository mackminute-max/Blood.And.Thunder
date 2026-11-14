import { validateSetup } from './validate.ts';
import { copyJson } from '../shared/immutable.ts';
import type { InitialConfiguration } from '../contracts/initialization.ts';
export interface BulkChange { ruId: string; assetId: string; field: string; oldValue: unknown; newValue: unknown }
const numericPaths = (input: unknown, prefix = ''): string[] => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return [];
  return Object.entries(input).flatMap(([key,value]) => typeof value === 'number' ? [`${prefix}${key}`] : value && typeof value === 'object' && !Array.isArray(value) ? numericPaths(value,`${prefix}${key}.`) : []);
};
export function bulkFields(config: InitialConfiguration): string[] {
  const groups = [
    ['driver',config.content.drivers], ['chariot',config.content.chariots], ['beasts',config.content.beasts],
  ] as const;
  return ['entry.preRaceStrategy',...groups.flatMap(([prefix,items]) => [...new Set(items.flatMap(item=>numericPaths(item)))].sort().map(path=>`${prefix}.${path}`))];
}
/** Pre-race only. Validate the entire candidate before exposing any mutation. */
export function previewBulkEdit(input: InitialConfiguration, field: string, value: unknown) {
  const candidate = copyJson(validateSetup(input.scenario,input.content));
  if (!bulkFields(candidate).includes(field)) throw new Error('Unsupported RU attribute path');
  const [group,...parts] = field.split('.'); const changes: BulkChange[] = [];
  for (const entry of candidate.scenario.entries) {
    const targets = group === 'entry' ? [entry] : group === 'driver' ? candidate.content.drivers.filter(d=>d.id===entry.driverId) : group === 'chariot' ? candidate.content.chariots.filter(c=>c.id===entry.chariotId) : candidate.content.beasts.filter(b=>entry.beastIds.includes(b.id));
    for(const target of targets) {
      let parent = target as unknown as Record<string,unknown>;
      for(const part of parts.slice(0,-1)) {
        if(!Object.hasOwn(parent,part) || !parent[part] || typeof parent[part]!=='object' || Array.isArray(parent[part])) throw new Error(`Missing attribute on ${target.id}`);
        parent=parent[part] as Record<string,unknown>;
      }
      const key=parts.at(-1)!;
      if(!Object.hasOwn(parent,key))throw new Error(`Missing attribute on ${target.id}`);
      changes.push({ruId:entry.id,assetId:target.id,field,oldValue:parent[key],newValue:value});
      parent[key]=value;
    }
  }
  return {configuration:validateSetup(candidate.scenario,candidate.content),changes};
}
