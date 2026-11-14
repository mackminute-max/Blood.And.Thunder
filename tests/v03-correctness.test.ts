import { expect, it } from 'vitest';
import { fixture } from './setup-fixture.ts';
import { createMovementEngine } from '../src/simulation/core/movement-engine.ts';
import { createRaceEngine } from '../src/simulation/core/race-engine.ts';
import { copyJson } from '../src/shared/immutable.ts';
import { laneConditions } from '../src/simulation/movement/conditions.ts';
import { deriveStats } from '../src/simulation/entities/derive.ts';
import { commitDamage } from '../src/simulation/combat/damage.ts';
import { createRng } from '../src/simulation/core/rng.ts';
import { recordRaceStatistics } from '../src/simulation/rules/statistics.ts';
import { resolveContacts } from '../src/simulation/movement/contact.ts';
it('intrinsic roughness changes braking/handling traction and severity changes corner speed', () => {
  const f=fixture(); const a=createMovementEngine(f.scenario,f.content); const ru=copyJson(a.snapshot().ruStates['ru-player']!);
  const baseline=deriveStats(a.initialConfiguration,ru);
  const lane=f.content.tracks[0]!.segments[0]!.lanes[0]!; lane.roughness=2;
  const b=createMovementEngine(f.scenario,f.content); const rough=deriveStats(b.initialConfiguration,ru);
  expect(rough.brakeMps2).toBeLessThan(baseline.brakeMps2);
  const segment=f.content.tracks[0]!.segments[0]!;segment.kind='corner';segment.turn='left';segment.severity=1;
  const c=createMovementEngine(f.scenario,f.content);const mild=laneConditions(c.initialConfiguration,ru.tile,10,50);
  segment.severity=3;const d=createMovementEngine(f.scenario,f.content);
  expect(laneConditions(d.initialConfiguration,ru.tile,10,50).safeSpeed).toBeLessThan(mild.safeSpeed);
});
it('chariot durability reduces actual damage once and records its factor', () => {
  const damage=(durability:number)=> {
    const f=fixture();f.content.chariots.find(c=>c.id==='chariot-player')!.durability=durability;
    const e=createMovementEngine(f.scenario,f.content);const state=copyJson(e.snapshot());const ru=state.ruStates['ru-player']!;
    commitDamage(e.initialConfiguration,state,new Map([['hit',{ruId:ru.id,kind:'chariot' as const,componentId:ru.chariot.id,total:20,attacks:[],contributors:[]}]]),createRng(state.rngStates.combat),()=>{},'test',0);
    return ru.combatStats.damageReceived;
  };
  expect(damage(100)).toBeLessThan(damage(0));expect(damage(70)).toBe(20);
});
it('driver nerve mechanically changes contact avoidance without replacing seeded rolls',()=>{
  const probability=(nerve:number)=>{
    const f=fixture();const t=f.content.tuningProfiles[0]!.environment.collision;t.enabled=true;t.avoidanceMin=0;t.avoidanceMax=1;t.avoidanceBase=.5;
    f.content.drivers.find(d=>d.id==='driver-player')!.nerve=nerve;
    const e=createMovementEngine(f.scenario,f.content);const state=copyJson(e.snapshot());state.ruStates['ru-iron']!.tile={segmentId:'seg-00',lane:1};
    const events:unknown[]=[];resolveContacts(e.initialConfiguration,state,[{actorId:'ru-player',targetId:'ru-iron',fraction:.5,lateral:true,closingSpeed:2}],()=>0,event=>events.push(event),[],0);
    return (events.find((event): event is {type:string;details:{probability:number}}=> typeof event==='object'&&event!==null&&'type' in event&&event.type==='collision_avoided'))!.details.probability;
  };
  expect(probability(100)).toBeGreaterThan(probability(0));
});
it('counts normalized progress passes and apportions tied lead time from authoritative paths',()=>{
  const f=fixture();const engine=createRaceEngine(f.scenario,f.content);const before=copyJson(engine.snapshot());const after=copyJson(before);
  for(const ru of Object.values(before.ruStates))ru.status='dnf';
  before.ruStates['ru-player']!.status='active';before.ruStates['ru-iron']!.status='active';
  before.ruStates['ru-player']!.normalizedCoursePosition=-.2;before.ruStates['ru-iron']!.normalizedCoursePosition=0;
  Object.assign(after,copyJson(before));after.elapsedRaceTicks=1;
  after.ruStates['ru-player']!.normalizedCoursePosition=.8;after.ruStates['ru-iron']!.normalizedCoursePosition=.2;
  const passes=recordRaceStatistics(before,after,[],1);
  expect(passes).toEqual([{ruId:'ru-player',targetRuId:'ru-iron',fraction:.25}]);
  expect(after.ruStates['ru-player']!.raceStats).toMatchObject({overtakes:1,timeLeadingSeconds:.75,penalties:0});
  expect(after.ruStates['ru-iron']!.raceStats.timeLeadingSeconds).toBeCloseTo(.25);
});
it('retains strict prior ordering through an exact tick-boundary tie before crediting a pass',()=>{
  const f=fixture();const engine=createRaceEngine(f.scenario,f.content);const start=copyJson(engine.snapshot());
  for(const ru of Object.values(start.ruStates))ru.status='dnf';
  for(const id of ['ru-player','ru-iron'])start.ruStates[id]!.status='active';
  start.ruStates['ru-player']!.normalizedCoursePosition=-.2;start.ruStates['ru-iron']!.normalizedCoursePosition=0;
  const tied=copyJson(start);tied.elapsedRaceTicks=1;tied.ruStates['ru-player']!.normalizedCoursePosition=0;
  expect(recordRaceStatistics(start,tied,[],1)).toEqual([]);
  const passed=copyJson(tied);passed.elapsedRaceTicks=2;passed.ruStates['ru-player']!.normalizedCoursePosition=.2;
  expect(recordRaceStatistics(tied,passed,[],1)).toEqual([{ruId:'ru-player',targetRuId:'ru-iron',fraction:0}]);expect(passed.ruStates['ru-player']!.raceStats.overtakes).toBe(1);
});
it('does not credit trailing active racers with lead time after a winner has finished',()=>{
  const f=fixture();const e=createRaceEngine(f.scenario,f.content);const before=copyJson(e.snapshot());before.finishRecords=[{ruId:'ru-iron',finishTimeSeconds:1,rank:1,tiedWith:[]}];before.ruStates['ru-iron']!.status='finished';
  const after=copyJson(before);after.elapsedRaceTicks=1;recordRaceStatistics(before,after,[],1);expect(Object.values(after.ruStates).reduce((sum,ru)=>sum+ru.raceStats.timeLeadingSeconds,0)).toBe(0);
});
