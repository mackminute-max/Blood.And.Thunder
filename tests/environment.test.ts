import { expect, it } from 'vitest';
import { fixture } from './setup-fixture.ts';
import { createMovementEngine, assertMovementState } from '../src/simulation/core/movement-engine.ts';
import { createRaceEngine, assertRaceState } from '../src/simulation/core/race-engine.ts';
import { replayRace, replayMovement } from '../src/simulation/core/replay.ts';
import { advanceEnvironment, assertEnvironmentState, markDisabled } from '../src/simulation/environment/lifecycle.ts';
import { applyFatigue } from '../src/simulation/environment/fatigue.ts';
import { laneConditions } from '../src/simulation/movement/conditions.ts';
import { deriveStats } from '../src/simulation/entities/derive.ts';
import { resolveContacts } from '../src/simulation/movement/contact.ts';
import { moveTick } from '../src/simulation/movement/schedule.ts';
import { chooseIntents } from '../src/simulation/ai/driver.ts';
import { validateSetup } from '../src/configuration/validate.ts';
import { copyJson } from '../src/shared/immutable.ts';
import type { MovementEventInput } from '../src/contracts/movement.ts';
import type { Hazard } from '../src/contracts/environment.ts';
import type { RaceScenario, ContentRegistry } from '../src/configuration/schemas.ts';
function setup(): { scenario: RaceScenario; content: ContentRegistry } {
  const f = fixture(); f.content.tuningProfiles[0]!.environment.fatigue.basePerSecond = .15; f.content.tuningProfiles[0]!.environment.fatigue.recoveryPerSecond = .08;
  return f;
}
function harness(f = setup()) {
  const engine = createMovementEngine(f.scenario, f.content); const state = copyJson(engine.snapshot()); state.tick = 1;
  const events: MovementEventInput[] = []; const emit = (event: MovementEventInput) => { events.push(event); };
  const advance = (tick: number) => advanceEnvironment(engine.initialConfiguration, state, tick, emit, []);
  return { engine, config: engine.initialConfiguration, state, events, emit, advance };
}
const rough: Hazard = { id: 'rough', type: 'track_roughness', tile: { segmentId: 'seg-00', lane: 0 }, createdAt: 1, expiresAt: 10, direction: 1, source: 'fixture' };
it('applies the configured fatigue formula once after movement, changing next-tick stats only', () => {
  const h = harness(); const ru = h.state.ruStates['ru-player']!; const initialDerived = copyJson(ru.derived); ru.speedMps = ru.derived.maxSpeedMps;
  const start = new Map([[ru.id, ru.speedMps]]); applyFatigue(h.config, h.state, start, h.emit);
  const expected = .2 * .15 * 1.2 * (1.2 - ru.derived.endurance / 200);
  expect(ru.teamFatigue).toBeCloseTo(expected); expect(ru.derived).toEqual(initialDerived); expect(deriveStats(h.config, ru).maxSpeedMps).toBeLessThan(initialDerived.maxSpeedMps);
  expect(ru.environmentStats.fatigueSamples).toBe(1); expect(h.events[0]?.type).toBe('fatigue_changed');
});
it('recovers when slow and not accelerating, clamps fatigue and applies Push Hard/weather multipliers', () => {
  const h = harness(); const ru = h.state.ruStates['ru-player']!; ru.teamFatigue = 20;
  applyFatigue(h.config, h.state, new Map([[ru.id, 0]]), h.emit); expect(ru.teamFatigue).toBeLessThan(20);
  ru.teamFatigue = 0; applyFatigue(h.config, h.state, new Map([[ru.id, 0]]), h.emit); expect(ru.teamFatigue).toBe(0);
  ru.speedMps = ru.derived.maxSpeedMps; ru.teamFatigue = 0; ru.activeSignId = 'push-hard'; applyFatigue(h.config, h.state, new Map([[ru.id, ru.speedMps]]), h.emit);
  const pushGain = ru.teamFatigue; ru.teamFatigue = 0; ru.activeSignId = null; applyFatigue(h.config, h.state, new Map([[ru.id, ru.speedMps]]), h.emit); expect(pushGain / ru.teamFatigue).toBeCloseTo(1.15);
  ru.teamFatigue = 100; applyFatigue(h.config, h.state, new Map([[ru.id, ru.speedMps]]), h.emit); expect(ru.teamFatigue).toBe(100);
  const f = setup(); f.scenario.weatherId = 'heat'; const heat = harness(f); const hot = heat.state.ruStates['ru-player']!; hot.speedMps = hot.derived.maxSpeedMps; applyFatigue(heat.config, heat.state, new Map([[hot.id, hot.speedMps]]), heat.emit);
  expect(hot.teamFatigue).toBeGreaterThan(0); expect(heat.events[0]?.type === 'fatigue_changed' && heat.events[0].details.weatherFactor).toBe(1.2);
});
it('does not advance fatigue or environmental time during countdown', () => {
  const f = setup(); f.scenario.rules.countdownTicks = 2; const engine = createRaceEngine(f.scenario, f.content);
  engine.step(); const two = engine.step(); expect(two.state.ruStates['ru-player']!.teamFatigue).toBe(0); expect(two.events.some(e => e.type === 'fatigue_changed')).toBe(false);
  expect(engine.step().state.ruStates['ru-player']!.teamFatigue).toBeGreaterThan(0);
});
it('applies fixed weather, local roughness and data-driven beast traits without moving units', () => {
  const f = setup(); f.scenario.weatherId = 'rain'; f.content.traitIds.push('mud'); f.content.beasts.find(b => b.id === 'beast-player-1')!.traits.push('mud');
  f.content.tuningProfiles[0]!.environment.traitModifiers.push({ traitId: 'mud', weatherIds: ['rain'], tractionMultiplier: 1.2, fatigueMultiplier: .8 });
  const h = harness(f); const ru = h.state.ruStates['ru-player']!; const tile = copyJson(ru.tile);
  const normal = laneConditions(h.config, tile, 10, 60, [], ru.id); const local = laneConditions(h.config, tile, 10, 60, [rough], ru.id);
  expect(normal.traction).toBeCloseTo(.88); expect(local.traction).toBeCloseTo(.704);
  expect(deriveStats(h.config, ru, [rough]).brakeMps2).toBeLessThan(deriveStats(h.config, ru).brakeMps2); expect(ru.tile).toEqual(tile);
});
it('disabled external intensity schedules no random incidents, while explicit fixtures remain available', () => {
  const f = setup(); f.scenario.environmentPlans = [{ id: 'debris', movementTick: 1, type: 'debris_spawn', tile: { segmentId: 'seg-04', lane: 0 }, durationTicks: 2 }];
  const h = harness(f); expect(h.state.environment.schedule.every(e => e.source === 'fixture')).toBe(true); h.advance(1); expect(h.state.hazards).toHaveLength(1);
  expect(h.events[0]?.type).toBe('hazard_activated'); h.advance(2); expect(h.state.hazards).toHaveLength(1); h.advance(3); expect(h.state.hazards).toHaveLength(0); expect(h.events.at(-1)?.type).toBe('hazard_expired');
});
it('never spawns a fixture inside an occupied tile and validates invalid references/durations', () => {
  const f = setup(); f.scenario.environmentPlans = [{ id: 'occupied', movementTick: 1, type: 'debris_spawn', tile: { segmentId: 'seg-00', lane: 0 }, durationTicks: 2 }];
  const h = harness(f); h.advance(1); expect(h.state.hazards).toHaveLength(0); expect(h.state.environment.skippedEvents).toBe(1); expect(h.events.some(e => e.type === 'hazard_skipped')).toBe(true);
  f.scenario.environmentPlans[0]!.tile.lane = 100; expect(() => validateSetup(f.scenario, f.content)).toThrow(); f.scenario.environmentPlans[0]!.tile.lane = 0; f.scenario.environmentPlans[0]!.durationTicks = 0; expect(() => validateSetup(f.scenario, f.content)).toThrow();
});
it('moves animals every configured interval, waits for occupied destinations and expires deterministically', () => {
  const f = setup(); f.scenario.environmentPlans = [{ id: 'animal', movementTick: 1, type: 'animal_crossing', tile: { segmentId: 'seg-02', lane: 0 }, durationTicks: 12 }];
  const h = harness(f); h.advance(1); h.advance(3); expect(h.state.hazards[0]!.tile.lane).toBe(0); h.advance(4); expect(h.state.hazards[0]!.tile.lane).toBe(1);
  h.state.ruStates['ru-iron']!.tile = { segmentId: 'seg-02', lane: 2 }; h.advance(7); expect(h.state.hazards[0]!.tile.lane).toBe(1); assertEnvironmentState(h.state);
  h.advance(13); expect(h.state.hazards).toHaveLength(0);
});
it('blocks every intermediate forward transition into debris without banking progress or overlap', () => {
  const h = harness(); const ru = h.state.ruStates['ru-player']!;
  h.state.hazards = [{ ...rough, type: 'debris_spawn', tile: { segmentId: 'seg-02', lane: 0 } }];
  ru.speedMps = 100; ru.targetSpeedMps = 100; ru.derivedOverrides.maxSpeedMps = 100;
  const output = moveTick(h.config, h.state); expect(output.events.some(e => e.type === 'movement_blocked' && e.reason === 'hazard')).toBe(true);
  expect(ru.tile.segmentId).toBe('seg-01'); expect(ru.progressInSegment).toBe(0); assertMovementState(h.state); assertEnvironmentState(h.state);
});
it('rejects a lateral fixture into a blocking hazard without modifying occupancy', () => {
  const f = setup(); f.scenario.maneuvers = [{ movementTick: 1, ruId: 'ru-player', laneDelta: 1, abortIfBlocked: true }];
  const h = harness(f); h.state.ruStates['ru-iron']!.status = 'retired'; h.state.ruStates['ru-player']!.speedMps = 1;
  h.state.hazards = [{ ...rough, type: 'debris_spawn', tile: { segmentId: 'seg-00', lane: 1 } }];
  const output = moveTick(h.config, h.state); expect(output.events.some(e => e.type === 'lane_change_resolved' && e.reason === 'hazard')).toBe(true); expect(h.state.ruStates['ru-player']!.tile.lane).toBe(0);
});
it('removes disabled occupancy at the configured delay while preserving component state and reason', () => {
  const h = harness(); const ru = h.state.ruStates['ru-iron']!; ru.status = 'disabled'; ru.statusReason = 'test-disabled'; ru.speedMps = 0;
  const components = copyJson([ru.driver, ru.chariot, ru.beasts]); markDisabled(h.state, 1, h.config, h.emit);
  h.advance(10); expect(ru.wreckRemoved).toBe(false); h.advance(11); expect(ru.wreckRemoved).toBe(true); expect(ru.status).toBe('disabled'); expect(ru.statusReason).toBe('test-disabled'); expect([ru.driver, ru.chariot, ru.beasts]).toEqual(components);
  expect(h.events.filter(e => e.type === 'wreck_removed')).toHaveLength(1); h.advance(12); expect(h.events.filter(e => e.type === 'wreck_removed')).toHaveLength(1);
});
it('supports immediate cleanup and earlier cleanup only when all legal routes are blocked', () => {
  const f = setup(); f.scenario.rules.disabledRemovalTicks = 0; const h = harness(f); const ru = h.state.ruStates['ru-iron']!; ru.status = 'disabled'; markDisabled(h.state, 1, h.config, h.emit); expect(ru.wreckRemoved).toBe(true);
  const g = setup(); g.scenario.rules.disabledRemovalTicks = 100; g.content.tuningProfiles[0]!.environment.events.earlyWreckClearBlockedTicks = 2; const x = harness(g); x.state.ruStates['ru-player']!.blockedTicks = 2;
  x.state.ruStates['ru-iron']!.status = 'disabled'; x.state.ruStates['ru-iron']!.disabledAtMovementTick = 1;
  x.state.ruStates['ru-vulture']!.tile = { segmentId: 'seg-01', lane: 0 }; x.advance(2); expect(x.state.ruStates['ru-iron']!.wreckRemoved).toBe(true);
  expect(x.events.some(e => e.type === 'wreck_removed' && e.details.reason === 'blocked_route_safety')).toBe(true);
});
it('separates harmless avoidance from physical contact and seeded component damage', () => {
  const f = setup(); f.content.tuningProfiles[0]!.environment.collision.enabled = true; const h = harness(f); const ru = h.state.ruStates['ru-player']!;
  const request = [{ actorId: ru.id, targetId: 'ru-iron', lateral: true, fraction: .5, closingSpeed: 20 }];
  resolveContacts(h.config, h.state, request, () => 0, h.emit, [], 1); expect(h.events[0]?.type).toBe('collision_avoided'); expect(ru.environmentStats.collisions).toBe(0);
  resolveContacts(h.config, h.state, request, () => 1, h.emit, [], 1); expect(h.events.some(e => e.type === 'contact')).toBe(true); expect(h.events.some(e => e.type === 'collision_damage')).toBe(true);
  expect(ru.chariot.health).toBeLessThan(100); expect(ru.environmentStats.collisionDamage).toBe(100 - ru.chariot.health); expect(ru.combatStats.attempts).toBe(0);
});
it('permits harmless minor contact and does not resolve the same unordered pair twice per group', () => {
  const f = setup(); f.content.tuningProfiles[0]!.environment.collision.enabled = true; const h = harness(f);
  const requests = [{ actorId: 'ru-player', targetId: 'ru-iron', lateral: true, fraction: 0, closingSpeed: 0 }, { actorId: 'ru-iron', targetId: 'ru-player', lateral: true, fraction: 0, closingSpeed: 0 }];
  resolveContacts(h.config, h.state, requests, () => 1, h.emit, [], 1); expect(h.events.filter(e => e.type === 'contact')).toHaveLength(1); expect(h.events.filter(e => e.type === 'collision_damage')).toHaveLength(0);
});
it('uses the full scheduler contact hook after a real blocked transition without retroactive movement', () => {
  const f = setup(); f.content.tuningProfiles[0]!.environment.collision.enabled = true; f.content.tuningProfiles[0]!.environment.collision.avoidanceMin = 0; f.content.tuningProfiles[0]!.environment.collision.avoidanceMax = 0;
  const h = harness(f); const ru = h.state.ruStates['ru-player']!; h.state.ruStates['ru-iron']!.tile = { segmentId: 'seg-02', lane: 0 }; h.state.ruStates['ru-iron']!.speedMps = 0; h.state.ruStates['ru-iron']!.targetSpeedMps = 0;
  ru.speedMps = 100; ru.targetSpeedMps = 100; ru.derivedOverrides.maxSpeedMps = 100;
  const output = moveTick(h.config, h.state); expect(output.events.some(e => e.type === 'movement_transition' && e.ruId === ru.id)).toBe(true); expect(output.events.some(e => e.type === 'contact')).toBe(true); expect(ru.tile.segmentId).toBe('seg-01'); assertMovementState(h.state);
});
it('AI perceives local hazards only, resets commitment on discovery and retains bounded hazard memory', () => {
  const h = harness(); const ru = h.state.ruStates['ru-player']!; h.state.hazards = [{ ...rough, type: 'debris_spawn', tile: { segmentId: 'seg-01', lane: 0 } }];
  chooseIntents(h.config, h.state, 1, h.emit); expect(ru.aiDecision!.perception.hazards).toHaveLength(1); expect(ru.aiDecision!.chosen.mode).toBe('brake'); expect(ru.aiMemory.hazards).toHaveLength(1);
  h.state.hazards = [{ ...rough, id: 'unseen', tile: { segmentId: 'seg-20', lane: 0 } }]; chooseIntents(h.config, h.state, 2, h.emit); expect(ru.aiDecision!.perception.hazards).toHaveLength(0); expect(ru.aiMemory.hazards).toHaveLength(1);
  chooseIntents(h.config, h.state, 20, h.emit); expect(ru.aiMemory.hazards).toHaveLength(0);
});
it('replays weather/fatigue/fixture events and cleanup in raw/race modes including countdown', () => {
  const f = setup(); f.scenario.rules.countdownTicks = 1; f.scenario.environmentPlans = [{ id: 'fixture', movementTick: 1, type: 'debris_spawn', tile: { segmentId: 'seg-04', lane: 0 }, durationTicks: 2 }];
  const race = createRaceEngine(f.scenario, f.content); for (let tick = 0; tick < 4; tick++) race.step(); expect(replayRace(JSON.parse(race.exportBundle())).latest()).toEqual(race.latest());
  const raw = createMovementEngine(f.scenario, f.content); for (let tick = 0; tick < 4; tick++) raw.step(); expect(replayMovement(JSON.parse(raw.exportBundle())).latest()).toEqual(raw.latest());
});
it('occasional seeds include zero events; schedules obey caps/window/spacing and reorder deterministically', () => {
  let absent = 0; let present = 0; const f = setup(); f.scenario.eventIntensity = 'occasional';
  for (let seed = 0; seed < 100; seed++) {
    f.scenario.seed = `events-${seed}`; const engine = createMovementEngine(f.scenario, f.content); const env = engine.snapshot().environment;
    const schedule = env.schedule; if (!schedule.length) absent++; else present++;
    expect(schedule.length).toBeLessThanOrEqual(3);
    for (let i = 0; i < schedule.length; i++) { expect(schedule[i]!.movementTick).toBeGreaterThanOrEqual(Math.ceil(env.expectedRaceTicks * .15)); expect(schedule[i]!.movementTick).toBeLessThanOrEqual(Math.floor(env.expectedRaceTicks * .85)); if (i) expect(schedule[i]!.movementTick - schedule[i - 1]!.movementTick).toBeGreaterThanOrEqual(20); }
  }
  expect(absent).toBeGreaterThan(0); expect(present).toBeGreaterThan(0);
  const original = createMovementEngine(f.scenario, f.content); f.scenario.entries.reverse(); f.content.tracks[0]!.segments.reverse(); f.content.weather.reverse(); const reordered = createMovementEngine(f.scenario, f.content); expect(reordered.snapshot()).toEqual(original.snapshot());
});
it('terminates 1000 compact seeded weather/event/contact races with finite state and legal occupancy', () => {
  const f = setup(); f.scenario.controller = 'ai'; f.scenario.eventIntensity = 'chaotic'; f.content.tuningProfiles[0]!.environment.collision.enabled = true; f.content.tuningProfiles[0]!.environment.events.spacingTicks = 1;
  f.scenario.entries = f.scenario.entries.slice(0, 3); const ids = f.scenario.entries.map(e => e.id); f.scenario.startingGrid = Object.fromEntries(ids.map((id, lane) => [id, { segmentId: 'seg-00', lane }])); f.scenario.gridRows = [{ id: 'front', segmentId: 'seg-00', ruIds: ids }]; f.scenario.targetSpeedRatios = Object.fromEntries(ids.map(id => [id, 1]));
  const track = f.content.tracks[0]!; track.segments = track.segments.slice(0, 4); track.segments[3]!.lanes.forEach(lane => { lane.next.segmentId = 'seg-00'; }); track.segments.forEach(segment => { segment.meters = 4; }); f.content.tuningProfiles[0]!.tickDurationSeconds = 1; f.scenario.rules.maxTicks = 8;
  let activated = 0; let contacts = 0;
  for (let seed = 0; seed < 1000; seed++) {
    f.scenario.seed = `environment-${seed}`; f.scenario.weatherId = ['clear', 'rain', 'storm', 'heat'][seed % 4]!; const engine = createRaceEngine(f.scenario, f.content); engine.runUntilComplete(); expect(engine.snapshot().phase).toBe('complete'); assertRaceState(copyJson(engine.snapshot())); assertEnvironmentState(engine.snapshot());
    activated += engine.snapshot().environment.activatedEvents; contacts += Object.values(engine.snapshot().ruStates).reduce((sum, ru) => sum + ru.environmentStats.collisions, 0);
  }
  expect(activated).toBeGreaterThan(0); expect(contacts).toBeGreaterThan(0);
}, 180000);
