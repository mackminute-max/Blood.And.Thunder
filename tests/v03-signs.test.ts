import { expect, it } from 'vitest';
import { fixture } from './setup-fixture.ts';
import { createRaceEngine } from '../src/simulation/core/race-engine.ts';
import { replayRace } from '../src/simulation/core/replay.ts';
import { copyJson } from '../src/shared/immutable.ts';
import { chooseIntents } from '../src/simulation/ai/driver.ts';
import type { SignId } from '../src/configuration/commands.ts';
function circuit(){
  const f=fixture();const ids=['ru-player','ru-iron'];f.scenario.entries=f.scenario.entries.filter(e=>ids.includes(e.id));
  f.scenario.startingGrid=Object.fromEntries(ids.map((id,lane)=>[id,{segmentId:'seg-00',lane}]));f.scenario.gridRows=[{id:'front',segmentId:'seg-00',ruIds:ids}];f.scenario.targetSpeedRatios=Object.fromEntries(ids.map(id=>[id,1]));
  f.scenario.rules.laps=5;f.scenario.rules.maxTicks=30;f.scenario.rules.combatAllowed=false;
  const track=f.content.tracks[0]!;track.segments=track.segments.slice(0,4);track.segments.forEach((s,i)=>{s.meters=1;s.kind='straight';s.turn='none';s.lanes.forEach(l=>{l.lengthMultiplier=1;l.next.segmentId=track.segments[(i+1)%4]!.id;});});
  const t=f.content.tuningProfiles[0]!;t.tickDurationSeconds=1;t.stats.speed.base=1;t.stats.speed.perTeamSpeed=0;t.stats.speed.rollingBase=1;t.stats.speed.rollingScale=0;t.stats.acceleration.base=100;
  return f;
}
const raise=(id:string,tick:number,signId:SignId='conserve',ruId='ru-player')=>({type:'raiseSign',source:'player',commandId:id,effectiveTick:tick,ruId,signId} as const);
const command=(type:'lowerSign'|'cancelPendingSign',id:string,tick:number)=>({type,source:'player',commandId:id,effectiveTick:tick,ruId:'ru-player'} as const);
it('activates pre-race signs at the common signal, including rear rows, without awarding a lap',()=>{
  const f=circuit();f.scenario.rules.countdownTicks=2;f.scenario.rules.allowDeveloperSignCommands=true;
  f.scenario.startingGrid['ru-iron']={segmentId:'seg-03',lane:1};f.scenario.gridRows=[{id:'front',segmentId:'seg-00',ruIds:['ru-player']},{id:'rear',segmentId:'seg-03',ruIds:['ru-iron']}];
  const engine=createRaceEngine(f.scenario,f.content);engine.submit(raise('front',1));engine.submit({...raise('rear',1,'push-hard','ru-iron'),source:'developer'});
  const one=engine.step();expect(one.state.ruStates['ru-player']).toMatchObject({activeSignId:null,pendingSign:{signId:'conserve'},signOpportunitiesRemaining:2});
  const signal=engine.step();for(const ru of Object.values(signal.state.ruStates))expect(ru.activeSignId).not.toBeNull();
  expect(signal.state.ruStates['ru-iron']!.completedLaps).toBe(0);expect(signal.events.filter(e=>e.type==='sign_activated')).toHaveLength(2);
});
it('mid-lap replacement stays pending, preserving the active sign, until one actual line crossing',()=>{
  const f=circuit();const engine=createRaceEngine(f.scenario,f.content);engine.submit(raise('first',1));engine.step();
  engine.submit(raise('replace',2,'push-hard'));let frame=engine.step();
  expect(frame.state.ruStates['ru-player']).toMatchObject({activeSignId:'conserve',pendingSign:{signId:'push-hard'},signOpportunitiesRemaining:1});
  expect(engine.submit(raise('second-pending',3)).accepted).toBe(false);
  while(!frame.events.some(e=>e.type==='sign_activated'))frame=engine.step();
  expect(frame.events.filter(e=>e.type==='sign_activated')).toHaveLength(1);
  expect(frame.events).toContainEqual(expect.objectContaining({type:'movement_transition',crossedStartLine:true,ruId:'ru-player'}));
  expect(frame.state.ruStates['ru-player']).toMatchObject({activeSignId:'push-hard',pendingSign:null,signUsage:{queued:2,activated:2}});
  expect(replayRace(JSON.parse(engine.exportBundle())).latest()).toEqual(frame);
});
it('lowering is free and leaves pending intact; cancellation has no refund; invalid pending raises do not charge',()=>{
  const f=circuit();const engine=createRaceEngine(f.scenario,f.content);engine.submit(raise('one',1));engine.step();
  engine.submit(raise('two',2,'push-hard'));engine.submit(raise('rejected-pending',2,'attack'));const pending=engine.step();expect(pending.events.some(e=>e.type==='command_rejected')).toBe(true);
  engine.submit(command('lowerSign','lower',3));engine.step();expect(engine.snapshot().ruStates['ru-player']).toMatchObject({activeSignId:null,pendingSign:{signId:'push-hard'},signOpportunitiesRemaining:1});
  engine.submit(command('cancelPendingSign','cancel',4));engine.step();expect(engine.snapshot().ruStates['ru-player']).toMatchObject({pendingSign:null,signOpportunitiesRemaining:1,signUsage:{cancelled:1}});
  engine.submit(raise('three',5,'conserve'));const crossing=engine.step();expect(crossing.state.ruStates['ru-player']).toMatchObject({activeSignId:'conserve',pendingSign:null,signOpportunitiesRemaining:0});
  expect(engine.submit(raise('exhausted',6)).accepted).toBe(false);
  expect(replayRace(JSON.parse(engine.exportBundle())).latest()).toEqual(engine.latest());
});
it('preserves unactivated pending state when the race ends and exports counters consistently',()=>{
  const f=circuit();f.scenario.rules.maxTicks=2;const engine=createRaceEngine(f.scenario,f.content);engine.step();engine.submit(raise('late',2));engine.step();
  expect(engine.snapshot().phase).toBe('complete');expect(engine.result()!.classification.find(e=>e.ruId==='ru-player')!.stats).toMatchObject({pendingSign:{signId:'conserve'},signsUsed:1,signUsage:{queued:1,activated:0}});
});
it('multi-tile forward crossings activate once and input reordering replays the same state',()=>{
  const f=circuit();const t=f.content.tuningProfiles[0]!;t.stats.speed.base=20;
  const a=createRaceEngine(f.scenario,f.content);a.step();a.submit(raise('mid',2,'push-hard'));const frame=a.step();expect(frame.events.filter(e=>e.type==='sign_activated')).toHaveLength(1);
  f.scenario.entries.reverse();f.scenario.gridRows[0]!.ruIds.reverse();const b=createRaceEngine(f.scenario,f.content);b.step();b.submit(raise('mid',2,'push-hard'));expect(b.step()).toEqual(frame);
});
it('higher utility influence measurably changes autonomous decisions and does not scale fatigue physics',()=>{
  const f=fixture();const base=f.content.tuningProfiles[0]!.ai;base.noise=0;base.signInfluence.globalStrength=1;
  for(const mode of ['push','cruise','conserve','brake'] as const)base.signs.conserve[mode]*=.3;
  const low=createRaceEngine({...f.scenario,controller:'ai'},f.content);const state=copyJson(low.snapshot());state.tick=1;state.ruStates['ru-player']!.activeSignId='conserve';
  const before=copyJson(state);chooseIntents(low.initialConfiguration,state,1,()=>{});const baseline=state.ruStates['ru-player']!.aiDecision!;
  base.signInfluence.globalStrength=2;const high=createRaceEngine({...f.scenario,controller:'ai'},f.content);chooseIntents(high.initialConfiguration,before,1,()=>{});const strong=before.ruStates['ru-player']!.aiDecision!;
  expect(strong.chosen.mode).toBe('conserve');expect(strong.chosen.mode).not.toBe(baseline.chosen.mode);expect(strong.fatigueGainMultiplier).toBe(baseline.fatigueGainMultiplier);
});
it('an input before the finishing movement activates at that fractional crossing without post-finish actions',()=>{
  const f=circuit();f.scenario.rules.laps=1;const engine=createRaceEngine(f.scenario,f.content);
  for(let i=0;i<4;i++)engine.step();engine.submit(raise('at-final-line',5));const frame=engine.step();
  const activation=frame.events.find(e=>e.type==='sign_activated');const finish=frame.events.find(e=>e.type==='ru_finished'&&e.ruId==='ru-player');
  expect(activation).toBeDefined();expect(finish).toBeDefined();
  expect(activation&&'fraction' in activation?activation.fraction:null).toBe(finish && 'details' in finish ? finish.details.fraction : null);
  expect(frame.state.ruStates['ru-player']).toMatchObject({status:'finished',pendingSign:null,signUsage:{activated:1}});
  expect(frame.state.ruStates['ru-player']!.combatStats.attempts).toBe(0);
});
it('an input submitted after a crossing waits for the next crossing',()=>{
  const f=circuit();const engine=createRaceEngine(f.scenario,f.content);for(let i=0;i<5;i++)engine.step();
  engine.submit(raise('after-line',6));const frame=engine.step();expect(frame.state.ruStates['ru-player']).toMatchObject({activeSignId:null,pendingSign:{signId:'conserve'}});
});
it('a disabled RU never activates a retained pending sign',async()=>{
  const {activatePendingSign}=await import('../src/simulation/core/signs.ts');const f=circuit();const engine=createRaceEngine(f.scenario,f.content);const state=copyJson(engine.snapshot());const ru=state.ruStates['ru-player']!;
  ru.status='disabled';ru.pendingSign={signId:'conserve',queuedAtTick:1,commandId:'pending-before-disable',source:'player'};const events:unknown[]=[];
  activatePendingSign(ru,2,.5,'line_crossing',event=>events.push(event));expect(events).toEqual([]);expect(ru.activeSignId).toBeNull();expect(ru.pendingSign.signId).toBe('conserve');
});
