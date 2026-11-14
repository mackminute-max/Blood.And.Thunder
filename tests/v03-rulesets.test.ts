import { expect, it } from 'vitest';
import { fixture } from './setup-fixture.ts';
import { createRaceEngine } from '../src/simulation/core/race-engine.ts';
import { copyJson } from '../src/shared/immutable.ts';
import { attackEligibility } from '../src/simulation/combat/targeting.ts';
import { planCombat } from '../src/simulation/combat/planning.ts';
import { resolveCombatPhase } from '../src/simulation/combat/resolve.ts';
import { moveTick } from '../src/simulation/movement/schedule.ts';
import { validateSetup } from '../src/configuration/validate.ts';
it('pure rules reject Attack signs at submission and configuration import without charging',()=>{
  const f=fixture(); f.scenario.rules.competitionStyle='pure';const engine=createRaceEngine(f.scenario,f.content);
  const attack={commandId:'attack',type:'raiseSign',source:'player',effectiveTick:1,ruId:'ru-player',signId:'attack'} as const;
  expect(engine.submit(attack).accepted).toBe(false);engine.step();expect(engine.snapshot().ruStates['ru-player']!.signOpportunitiesRemaining).toBe(3);
  expect(()=>validateSetup({...f.scenario,scriptedCommands:[attack]},f.content)).toThrow(/incompatible/);
});
it('suppresses offensive AI candidates and rejects direct resolver plans in Pure Racing',()=>{
  const f=fixture();f.scenario.rules.competitionStyle='pure';
  const engine=createRaceEngine({...f.scenario,controller:'ai'},f.content);const state=copyJson(engine.snapshot());state.tick=1;
  const result=planCombat(engine.initialConfiguration,state,1,()=>{},[]);
  expect(result.plans).toEqual([]);expect(Object.values(state.ruStates).every(ru=>ru.combatDecision!.candidates.length===0)).toBe(true);
  const weapon=f.content.weapons.find(w=>w.channel==='ram')!;const plan={ruId:'ru-player',targetRuId:'ru-iron',weaponId:weapon.id};
  expect(attackEligibility(engine.initialConfiguration,state,plan)).toBe('combat_prohibited');
  const before=copyJson(state);const events:unknown[]=[];resolveCombatPhase(engine.initialConfiguration,state,[plan],new Set(),'contact',e=>events.push(e),[]);
  expect(state.ruStates).toEqual(before.ruStates);expect(events).toContainEqual(expect.objectContaining({type:'attack_rejected',details:expect.objectContaining({reason:'combat_prohibited'})}));
});
it('retains reproducible incidental contact consequences in Pure Racing',()=>{
  const f=fixture();f.scenario.rules.competitionStyle='pure';const t=f.content.tuningProfiles[0]!;
  t.tickDurationSeconds=1;t.environment.collision.enabled=true;t.environment.collision.avoidanceMin=0;t.environment.collision.avoidanceMax=0;t.stats.braking.base=0;t.stats.braking.perDriving=0;t.stats.braking.perTeamAgility=0;
  const engine=createRaceEngine(f.scenario,f.content);const state=copyJson(engine.snapshot());state.tick=1;
  for(const ru of Object.values(state.ruStates)) {ru.speedMps=0;ru.targetSpeedMps=0;}
  const actor=state.ruStates['ru-player']!;actor.speedMps=10;actor.targetSpeedMps=10;
  actor.tile={segmentId:'seg-00',lane:0};state.ruStates['ru-iron']!.tile={segmentId:'seg-01',lane:0};
  f.content.tracks[0]!.segments[0]!.meters=1;
  const withoutContact=copyJson(state);const configured=createRaceEngine(f.scenario,f.content);const result=moveTick(configured.initialConfiguration,state);
  t.environment.collision.enabled=false;moveTick(createRaceEngine(f.scenario,f.content).initialConfiguration,withoutContact);
  expect(actor.speedMps).toBeLessThan(withoutContact.ruStates['ru-player']!.speedMps);
  expect(result.events).toContainEqual(expect.objectContaining({type:'contact',details:expect.objectContaining({actionKind:'incidental_contact'})}));
  expect(state.ruStates['ru-iron']!.speedMps).toBe(0);
  expect(Object.values(state.ruStates).reduce((sum,ru)=>sum+ru.environmentStats.collisions,0)).toBeGreaterThan(0);
});
it('paired rulesets permit a legal Combat attack and reject the same Pure action',()=>{
  const f=fixture();const plan={ruId:'ru-player',targetRuId:'ru-iron',weaponId:'short-sword'};
  f.scenario.entries.find(e=>e.id===plan.ruId)!.weaponIds=['short-sword'];
  const combat=createRaceEngine(f.scenario,f.content);const state=copyJson(combat.snapshot());
  expect(attackEligibility(combat.initialConfiguration,state,plan)).toBeNull();
  f.scenario.rules.competitionStyle='pure';const pure=createRaceEngine(f.scenario,f.content);
  expect(attackEligibility(pure.initialConfiguration,state,plan)).toBe('combat_prohibited');
});
