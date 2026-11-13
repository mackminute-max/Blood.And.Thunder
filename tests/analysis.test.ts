import { expect, it } from 'vitest';
import { fixture } from './setup-fixture.ts';
import { createRaceEngine } from '../src/simulation/core/race-engine.ts';
import { createMovementEngine } from '../src/simulation/core/movement-engine.ts';
import { importDiagnostic, auditDiagnostic, compareDiagnostics, compareDiagnosticSources, changedPaths } from '../src/diagnostics/compare.ts';
import { runMeasuredRace, createMetrics, aggregate, compareBatches, percentile, reportCsv } from '../src/diagnostics/batch.ts';
import { copyJson } from '../src/shared/immutable.ts';
function compact() {
  const f = fixture(); const ids=f.scenario.entries.slice(0,1).map(e=>e.id); f.scenario.entries=f.scenario.entries.slice(0,1); f.scenario.startingGrid=Object.fromEntries(ids.map(id=>[id,{segmentId:'seg-00',lane:0}]));f.scenario.gridRows=[{id:'front',segmentId:'seg-00',ruIds:ids}];f.scenario.targetSpeedRatios=Object.fromEntries(ids.map(id=>[id,1]));f.scenario.rules.laps=1;f.scenario.rules.maxTicks=20;
  const track=f.content.tracks[0]!;track.segments=track.segments.slice(0,4);track.segments.forEach(s=>{s.meters=1;});track.segments[3]!.lanes.forEach(l=>{l.next.segmentId='seg-00';});f.content.tuningProfiles[0]!.tickDurationSeconds=1;return f;
}
it('audits input-reexecuted state, latest events and full command journal',()=>{
  const f=fixture();const engine=createRaceEngine(f.scenario,f.content);engine.submit({commandId:'s',type:'raiseSign',source:'player',effectiveTick:1,ruId:'ru-player',signId:'conserve'});engine.step();
  const audit=auditDiagnostic(importDiagnostic(engine.exportBundle()));expect(audit.valid).toBe(true);expect(audit.verifiedState).toEqual(engine.snapshot());expect(audit.latestEvents).toEqual(engine.latest().events);
});
it('detects altered serialized state even when exported hash was left untouched',()=>{
  const f=fixture();const e=createRaceEngine(f.scenario,f.content);e.step();const raw=JSON.parse(e.exportBundle());raw.state.ruStates['ru-player'].speedMps=999;
  const audit=auditDiagnostic(importDiagnostic(JSON.stringify(raw)));expect(audit.matchesExportedHash).toBe(true);expect(audit.valid).toBe(false);expect(audit.changedPaths.some(p=>p.path.endsWith('/speedMps'))).toBe(true);
});
it('detects altered journal receipts and latest event payloads without trusting them',()=>{
  const f=fixture();const e=createRaceEngine(f.scenario,f.content);e.submit({commandId:'s',type:'lowerSign',source:'player',effectiveTick:1,ruId:'ru-player'});e.step();const raw=JSON.parse(e.exportBundle());raw.commandJournal[0].receipt.reason='tampered';raw.latestTick.events=[];
  const audit=auditDiagnostic(importDiagnostic(JSON.stringify(raw)));expect(audit.matchesJournal).toBe(false);expect(audit.matchesLatestEvents).toBe(false);expect(audit.valid).toBe(false);
});
it('finds the first command-caused divergent frame and changed paths/events',()=>{
  const f=fixture();const a=createRaceEngine(f.scenario,f.content);const b=createRaceEngine(f.scenario,f.content);b.submit({commandId:'s',type:'raiseSign',source:'player',effectiveTick:2,ruId:'ru-player',signId:'conserve'});
  for(let i=0;i<3;i++){a.step();b.step();}const result=compareDiagnostics(importDiagnostic(a.exportBundle()),importDiagnostic(b.exportBundle()));expect(result.identical).toBe(false);expect(result.firstDifference?.leftTick).toBe(2);expect(result.firstDifference?.stateChanges.some(p=>p.path.endsWith('/activeSignId'))).toBe(true);expect(result.firstDifference?.rightEvents.some(e=>e.type==='sign_raised')).toBe(true);
});
it('reconstructs canonical comparisons independently of uploaded trace ring retention',()=>{
  const f=fixture();const e=createRaceEngine(f.scenario,f.content);e.step();e.step();const a=importDiagnostic(e.exportBundle());const b=copyJson(a);b.initialConfiguration.scenario.entries.reverse();b.initialConfiguration.content.weapons.reverse();expect(compareDiagnostics(a,importDiagnostic(JSON.stringify(b))).identical).toBe(true);
});
it('reports unequal endpoints instead of claiming identical full runs from a shared prefix',()=>{
  const f=fixture();const e=createRaceEngine(f.scenario,f.content);e.step();const a=importDiagnostic(e.exportBundle());e.step();const b=importDiagnostic(e.exportBundle());const comparison=compareDiagnostics(a,b);expect(comparison.identical).toBe(false);expect(comparison.firstDifference?.leftTick).toBeNull();expect(comparison.firstDifference?.rightTick).toBe(2);
});
it('captures a failed attempt at the same committed tick and replays its error journal',()=>{
  const f=fixture();f.content.tracks[0]!.segments.forEach(s=>{s.meters=1e-8;});f.content.tuningProfiles[0]!.movement.maxTransitionsPerTick=1;const e=createRaceEngine(f.scenario,f.content);const before=importDiagnostic(e.exportBundle());e.step();expect(e.snapshot().phase).toBe('error');const after=importDiagnostic(e.exportBundle());expect(auditDiagnostic(after).valid).toBe(true);const result=compareDiagnostics(before,after);expect(result.firstDifference?.rightPhase).toBe('error');expect(result.firstDifference?.rightTick).toBe(0);
});
it('supports raw movement audit and rejects mixed engine comparisons',()=>{
  const f=fixture();const raw=createMovementEngine(f.scenario,f.content);raw.step();expect(auditDiagnostic(importDiagnostic(raw.exportBundle())).valid).toBe(true);const race=createRaceEngine(f.scenario,f.content);expect(()=>compareDiagnostics(importDiagnostic(raw.exportBundle()),importDiagnostic(race.exportBundle()))).toThrow(/same engine kind/);
});
it('labels unsupported version inspection noncanonical without executing old configurations',()=>{
  const f=fixture();const e=createRaceEngine(f.scenario,f.content);const raw=JSON.parse(e.exportBundle());raw.initialConfiguration.scenario.simulationVersion='0.1.0';const result=compareDiagnosticSources(e.exportBundle(),JSON.stringify(raw));expect(result.canonical).toBe(false);expect(result.identical).toBeNull();expect(()=>importDiagnostic(JSON.stringify(raw))).toThrow();
});
it('rejects malformed diagnostics, excessive horizons and invalid endpoint modes',()=>{
  expect(()=>importDiagnostic('{}')).toThrow();const f=fixture();const e=createRaceEngine(f.scenario,f.content);const raw=JSON.parse(e.exportBundle());raw.state.phase='halted';expect(()=>importDiagnostic(JSON.stringify(raw))).toThrow(/phase/);raw.state.phase='running';raw.state.tick=6001;expect(()=>importDiagnostic(JSON.stringify(raw))).toThrow(/horizon/);raw.state.tick=1e9;expect(()=>importDiagnostic(JSON.stringify(raw))).toThrow(/safety limit/);
});
it('uses bounded JSON-pointer path changes and the documented rounded-eight precision',()=>{
  expect(changedPaths({'a/b':1},{'a/b':2})).toEqual([{path:'/a~1b',left:1,right:2}]);expect(changedPaths({a:1,b:2},{a:3,b:4},1)).toHaveLength(1);expect(changedPaths({a:1.0000000001},{a:1})).toEqual([]);
});
it('measures full-lap times and fractional finish lane exposure from real transitions',()=>{
  const f=compact();const run=runMeasuredRace(f.scenario,f.content);expect(run.finished).toBe(1);expect(run.lapTimes).toHaveLength(1);expect(run.lapTimes[0]).toBeGreaterThan(0);expect(Object.values(run.laneSeconds).reduce((a,b)=>a+b,0)).toBeCloseTo(run.lapTimes[0]!);expect(run.failure).toBeNull();
});
it('excludes rear approach from measured lap duration while retaining common-clock lane time',()=>{
  const f=compact();f.scenario.startingGrid['ru-player']!.segmentId='seg-03';f.scenario.gridRows[0]!.segmentId='seg-03';const run=runMeasuredRace(f.scenario,f.content);expect(run.finished).toBe(1);expect(run.lapTimes).toHaveLength(1);expect(Object.values(run.laneSeconds).reduce((a,b)=>a+b,0)).toBeGreaterThan(run.lapTimes[0]!);
});
it('records actual attacks, fatalities, disable reasons and bounded failure captures',()=>{
  const f=fixture();f.scenario.rules.maxTicks=1;f.scenario.combatPlans=[{movementTick:1,ruId:'ru-player',targetRuId:'ru-iron',weaponId:'short-sword'}];const w=f.content.weapons.find(w=>w.id==='short-sword')!;w.minDamage=1000;w.maxDamage=1000;w.eligibleTargets=['driver'];w.targetWeights={driver:1,beast:0,chariot:0};f.content.tuningProfiles[0]!.combat.hitMin=1;f.content.tuningProfiles[0]!.combat.hitMax=1;f.content.lethalityProfiles.find(p=>p.id==='dangerous')!.fatalityChance=1;
  const run=runMeasuredRace(f.scenario,f.content);expect(run.attacks).toBe(1);expect(run.hits).toBe(1);expect(run.fatalities).toBe(1);expect(run.dnfReasons.driver_disabled).toBe(1);
  f.content.tracks[0]!.segments.forEach(s=>{s.meters=1e-8;});f.content.tuningProfiles[0]!.movement.maxTransitionsPerTick=1;const failed=runMeasuredRace(f.scenario,f.content);expect(failed.failure?.diagnostic).toBeDefined();expect(failed.terminal).toBe('error');
});
it('aggregates distributions and compares identical paired seeds without significance claims',()=>{
  const f=compact();const run=runMeasuredRace(f.scenario,f.content);const aggregateResult=aggregate([run,run]);expect(aggregateResult.races).toBe(2);expect(aggregateResult.finishRate).toBe(1);expect(aggregateResult.lapTimes.samples).toBe(2);expect(compareBatches([run],[run]).deltas[0]!.finishRate).toBe(0);expect(()=>compareBatches([run],[{...run,seed:'different'}])).toThrow();expect(percentile([0,10,20],.1)).toBe(2);expect(percentile([], .5)).toBeNull();
});
it('produces deterministic metrics without changing final state and escapes spreadsheet formula seeds',()=>{
  const f=compact();f.scenario.seed='=FORMULA,"seed"';const run=runMeasuredRace(f.scenario,f.content);const engine=createRaceEngine(f.scenario,f.content);const metrics=createMetrics(engine.initialConfiguration);metrics.append(engine.latest());while(engine.snapshot().phase!=='complete')metrics.append(engine.step());expect(metrics.finish(engine)).toEqual(run);expect(reportCsv([run])).toContain("'=FORMULA");expect(reportCsv([run])).toContain('""seed""');
});

it('runs batch JSON/CSV and first-divergence CLIs with reproducible explicit plans',async()=>{
  const {mkdtempSync,writeFileSync,readFileSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {execFileSync}=await import('node:child_process');const dir=mkdtempSync(join(tmpdir(),'bt-analysis-'));
  try{
    const plan={kind:'blood-thunder-batch-plan-e1',seeds:['CLI-E-1','CLI-E-2'],variants:[{id:'baseline',scenarioFile:'src/content/scenarios/e-compact.scenario.json',contentFile:'src/content/scenarios/e-compact.content.json'},{id:'conserve',scenarioFile:'src/content/scenarios/e-compact.scenario.json',contentFile:'src/content/scenarios/e-compact.content.json',sign:'conserve'}]};const path=join(dir,'plan.json');writeFileSync(path,JSON.stringify(plan));const prefix=join(dir,'report');execFileSync(process.execPath,['scripts/batch.ts',path,prefix],{stdio:'pipe'});const report=JSON.parse(readFileSync(prefix+'.json','utf8'));expect(report.variants[0].runs.map((r:{seed:string})=>r.seed)).toEqual(plan.seeds);expect(report.comparisons[0].pairs).toBe(2);expect(readFileSync(prefix+'-baseline.csv','utf8').split('\n')).toHaveLength(4);
    const f=compact();const e=createRaceEngine(f.scenario,f.content);e.step();const a=join(dir,'a.json');const b=join(dir,'b.json');writeFileSync(a,e.exportBundle());e.step();writeFileSync(b,e.exportBundle());const compared=JSON.parse(execFileSync(process.execPath,['scripts/compare.ts',a,b],{encoding:'utf8'}));expect(compared.identical).toBe(false);expect(compared.firstDifference.frameIndex).toBe(2);
  }finally{rmSync(dir,{recursive:true,force:true});}
},15000);

it('cannot claim capture identity when reconstructed inputs hide tampered historical evidence', () => {
  const f = fixture(); const engine = createRaceEngine(f.scenario, f.content); engine.step();
  const good = importDiagnostic(engine.exportBundle());
  const altered = copyJson(good); altered.state.phase = 'complete';
  const result = compareDiagnostics(good, altered);
  expect(result.identical).toBe(false);
  expect(result.reconstructedIdentical).toBe(true);
  expect(result.capturesValid).toBe(false);
  expect(result.captureAudits.left.valid).toBe(true);
  expect(result.captureAudits.right.valid).toBe(false);
});
