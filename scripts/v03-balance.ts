import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateSetup } from '../src/configuration/validate.ts';
import { previewBulkEdit } from '../src/configuration/bulk-edit.ts';
import { copyJson } from '../src/shared/immutable.ts';
import { runMeasuredRace, aggregate, compareBatches, reportCsv } from '../src/diagnostics/batch.ts';
import { stateHash } from '../src/diagnostics/state-hash.ts';
import type { InitialConfiguration } from '../src/contracts/initialization.ts';
const read=(path:string)=>JSON.parse(readFileSync(path,'utf8')) as unknown;
const root=resolve(process.argv[2]??'/tmp/bt-v03-evidence');mkdirSync(root,{recursive:true});
const quick=process.argv.includes('--quick');const referenceSeeds=Array.from({length:quick?1:12},(_,i)=>`v03-reference-${String(i+1).padStart(3,'0')}`);
const compactSeeds=Array.from({length:quick?2:64},(_,i)=>`v03-compact-${String(i+1).padStart(3,'0')}`);
const reference=validateSetup(read('src/content/oval-six-v1.scenario.json'),read('src/content/reference.content.json'));
const compact=validateSetup(read('src/content/scenarios/e-compact.scenario.json'),read('src/content/scenarios/e-compact.content.json'));
let equalized=copyJson(reference);
for(const field of ['beasts.speed','beasts.power','beasts.agility','beasts.endurance','beasts.discipline','beasts.toughness','chariot.stability','chariot.durability','chariot.protection','chariot.rollingEfficiency','chariot.maneuverability','driver.driving','driver.beastHandling','driver.combat','driver.awareness','driver.nerve','driver.personality.aggression','driver.personality.riskTolerance','driver.personality.patience','driver.personality.competitiveness','driver.personality.discipline'])equalized=previewBulkEdit(equalized,field,70).configuration;
equalized=previewBulkEdit(equalized,'chariot.weightKg',180).configuration;
for(const group of ['driver','chariot','beasts']){
  equalized=previewBulkEdit(equalized,`${group}.maxHealth`,200).configuration;
  equalized=previewBulkEdit(equalized,`${group}.currentHealth`,100).configuration;
  equalized=previewBulkEdit(equalized,`${group}.maxHealth`,100).configuration;
}
equalized=previewBulkEdit(equalized,'entry.preRaceStrategy','balanced').configuration;
const presets:Record<string,InitialConfiguration>={};
for(const style of ['combat','pure'] as const){const config=copyJson(reference);config.scenario.rules.competitionStyle=style;presets[`${style}-baseline`]=config;}
presets['equalized-rus']=equalized;presets['high-sign-influence']=copyJson(reference);presets['high-sign-influence']!.content.tuningProfiles.find(p=>p.id===reference.scenario.tuningProfileId)!.ai.signInfluence.globalStrength=4;
const presetDir='src/content/scenarios/v03';mkdirSync(presetDir,{recursive:true});
for(const [name,config] of Object.entries(presets))writeFileSync(`${presetDir}/${name}.configuration.json`,JSON.stringify({kind:'blood-thunder-configuration-a4-1',name,mode:'race',...config},null,2)+'\n');
type Variant={id:string;track:string;configuration:InitialConfiguration;seeds:string[];runs:ReturnType<typeof runMeasuredRace>[];aggregate:ReturnType<typeof aggregate>};
const variants:Variant[]=[];
function measure(track:string,source:InitialConfiguration,style:'combat'|'pure',strength:number|null,seeds:string[]){
  const configuration=copyJson(source);configuration.scenario.rules.competitionStyle=style;
  if(strength!==null){configuration.content.tuningProfiles.find(p=>p.id===configuration.scenario.tuningProfileId)!.ai.signInfluence.globalStrength=strength;const player=configuration.scenario.entries.find(e=>e.isPlayer)!;configuration.scenario.scriptedCommands=[{type:'raiseSign',source:'player',commandId:'v03-pre-start-conserve',effectiveTick:1,ruId:player.id,signId:'conserve'}];}
  const id=`${track}-${style}-${strength===null?'no-sign':`conserve-${strength}x`}`;const runs=[];
  for(const seed of seeds){const scenario={...configuration.scenario,seed};const run=runMeasuredRace(scenario,configuration.content);runs.push(run);console.log(`${id}: ${runs.length}/${seeds.length} · ${run.finished}/${run.entrants} finished · ${run.attacks} attacks`);if(run.failure)throw new Error(`${id}/${seed}: ${run.failure.message}`);if(style==='pure'&&(run.attacks||run.ramAttempts))throw new Error(`Illegal offense in ${id}/${seed}`);}
  const variant={id,track,configuration,seeds,runs,aggregate:aggregate(runs)};variants.push(variant);writeFileSync(`${root}/${id}.csv`,reportCsv(runs));writeFileSync(`${root}/checkpoint.json`,JSON.stringify(variants,null,2)+'\n');
}
for(const style of ['combat','pure'] as const)for(const strength of [null,1,2,4])measure('compact',compact,style,strength,compactSeeds);
for(const style of ['combat','pure'] as const)for(const strength of [null,2,1,4])measure('reference',reference,style,strength,strength===1||strength===4?referenceSeeds.slice(0,quick?1:4):referenceSeeds);
for(const style of ['combat','pure'] as const)measure('equalized-reference',equalized,style,null,referenceSeeds.slice(0,quick?1:4));
const comparisons=variants.filter(v=>v.configuration.scenario.scriptedCommands.length).map(v=>{const baseline=variants.find(a=>a.track===v.track&&a.configuration.scenario.rules.competitionStyle===v.configuration.scenario.rules.competitionStyle&&!a.configuration.scenario.scriptedCommands.length)!;return {baseline:baseline.id,variant:v.id,...compareBatches(baseline.runs.filter(r=>v.seeds.includes(r.seed)),v.runs)};});
const report={kind:'blood-thunder-v03-balance',simulationVersion:reference.scenario.simulationVersion,environment:{node:process.version,platform:process.platform,architecture:process.arch},quick,totalRaces:variants.reduce((sum,v)=>sum+v.runs.length,0),variants,comparisons};
writeFileSync(`${root}/report.json`,JSON.stringify(report,null,2)+'\n');
const summary={...report,kind:'blood-thunder-v03-balance-summary',variants:variants.map(v=>({id:v.id,track:v.track,seeds:v.seeds,configurationHash:stateHash(v.configuration),tuningHash:stateHash(v.configuration.content.tuningProfiles.find(p=>p.id===v.configuration.scenario.tuningProfileId)),aggregate:v.aggregate,exampleClassification:v.runs[0]?.perRu??[],runs:v.runs.map(run=>({...run,perRu:undefined,failure:undefined}))}))};
writeFileSync(`${root}/summary.json`,JSON.stringify(summary,null,2)+'\n');console.log(`Completed ${report.totalRaces} races. Evidence: ${root}/summary.json`);
