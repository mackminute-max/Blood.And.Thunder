import { expect, it } from 'vitest';
import { fixture } from './setup-fixture.ts';
import { createRaceEngine, assertRaceState } from '../src/simulation/core/race-engine.ts';
import { createMovementEngine } from '../src/simulation/core/movement-engine.ts';
import { planCombat } from '../src/simulation/combat/planning.ts';
import { perceive, chooseIntents } from '../src/simulation/ai/driver.ts';
import { replayRace, replayMovement } from '../src/simulation/core/replay.ts';
import { copyJson } from '../src/shared/immutable.ts';
import type { SignId } from '../src/configuration/commands.ts';
function setupAI() {
  const setup = fixture();
  return { ...setup, scenario: { ...setup.scenario, controller: 'ai' as const, maneuvers: [] } };
}
const sign = (commandId: string, signId: SignId = 'conserve', effectiveTick = 1, ruId = 'ru-player') => ({ type: 'raiseSign', source: 'player', commandId, signId, effectiveTick, ruId });
const lower = (commandId: string, effectiveTick: number) => ({ type: 'lowerSign', source: 'player', commandId, effectiveTick, ruId: 'ru-player' });
it('scores twelve movement candidates, records rejected choices, perception and actual outcome', () => {
  const setup = setupAI(); const engine = createRaceEngine(setup.scenario, setup.content); const step = engine.step();
  const decision = step.state.ruStates['ru-player']!.aiDecision!;
  expect(decision.candidates).toHaveLength(12); expect(decision.candidates.some(candidate => candidate.rejected === 'stationary')).toBe(true);
  expect(decision.chosen.rejected).toBeNull(); expect(decision.outcome).not.toBeNull();
  expect(step.events.some(event => event.type === 'ai_intent')).toBe(true); expect(step.events.some(event => event.type === 'ai_outcome')).toBe(true);
  expect(step.diagnostics.some(record => record.subsystem === 'ai')).toBe(true);
  assertRaceState(copyJson(step.state));
});
it('does not expose or score unseen opponents or their hidden intentions', () => {
  const setup = setupAI(); const engine = createMovementEngine(setup.scenario, setup.content);
  const a = copyJson(engine.snapshot()); a.tick = 1;
  a.ruStates['ru-iron']!.tile = { segmentId: 'seg-20', lane: 1 };
  const b = copyJson(a); b.ruStates['ru-iron']!.status = 'disabled'; b.ruStates['ru-iron']!.speedMps = 50; b.ruStates['ru-iron']!.tile = { segmentId: 'seg-25', lane: 2 };
  expect(perceive(engine.initialConfiguration, a, 'ru-player').objects.some(object => object.id === 'ru-iron')).toBe(false);
  chooseIntents(engine.initialConfiguration, a, 1, () => {}); chooseIntents(engine.initialConfiguration, b, 1, () => {});
  expect(a.ruStates['ru-player']!.aiDecision).toEqual(b.ruStates['ru-player']!.aiDecision);
  expect(a.ruStates['ru-player']!.aiDecision!.perception.objects.every(object => !('aiDecision' in object))).toBe(true);
});
it('limits awareness by skill and visibility while keeping same-segment observations', () => {
  const setup = setupAI(); setup.content.drivers.find(driver => driver.id === 'driver-player')!.awareness = 0;
  const low = createMovementEngine(setup.scenario, setup.content); const state = copyJson(low.snapshot());
  state.ruStates['ru-iron']!.tile.segmentId = 'seg-04';
  expect(perceive(low.initialConfiguration, state, 'ru-player').objects.some(object => object.id === 'ru-iron')).toBe(false);
  setup.content.drivers.find(driver => driver.id === 'driver-player')!.awareness = 100;
  const high = createMovementEngine(setup.scenario, setup.content);
  expect(perceive(high.initialConfiguration, state, 'ru-player').objects.some(object => object.id === 'ru-iron')).toBe(true);
  const damaged = copyJson(state); damaged.ruStates['ru-player']!.driver.band = 'damaged';
  expect(perceive(high.initialConfiguration, damaged, 'ru-player')).toMatchObject({ effectiveAwareness: 90, aheadRange: 5 });
  setup.content.weather[0]!.visibility = .2;
  const poor = createMovementEngine(setup.scenario, setup.content);
  const perceived = perceive(poor.initialConfiguration, state, 'ru-player');
  expect(perceived.aheadRange).toBe(1); expect(perceived.objects.some(object => object.id === 'ru-vulture')).toBe(true);
});
it('exposes configurable personality, strategy, noise and sign utility contributions', () => {
  const setup = setupAI(); const tuning = setup.content.tuningProfiles[0]!.ai; tuning.noise = 0;
  setup.scenario.entries.find(entry => entry.id === 'ru-player')!.preRaceStrategy = 'endurance';
  setup.content.drivers.find(driver => driver.id === 'driver-player')!.personality.patience = 100;
  const engine = createRaceEngine(setup.scenario, setup.content); engine.submit(sign('conserve'));
  const decision = engine.step().state.ruStates['ru-player']!.aiDecision!;
  expect(decision.chosen.mode).toBe('conserve');
  expect(decision.chosen.factors.strategy).toBe(10); expect(decision.chosen.factors.sign).toBeGreaterThan(0); expect(decision.chosen.factors.personality).toBeGreaterThan(0);
});
it('retains an absolute lane plan without repeated multi-lane drift and resets on failure/sign changes', () => {
  const setup = setupAI(); setup.content.tuningProfiles[0]!.ai.noise = 0;
  const engine = createMovementEngine(setup.scenario, setup.content); const state = copyJson(engine.snapshot()); state.tick = 2;
  const ru = state.ruStates['ru-player']!; ru.speedMps = 1;
  ru.aiMemory = { hazards: [], targetLane: 0, commitmentUntil: 4, reevaluate: false, lastFailed: false };
  chooseIntents(engine.initialConfiguration, state, 2, () => {});
  expect(ru.aiDecision!.chosen.targetLane).toBe(0); expect(ru.aiMemory.commitmentUntil).toBe(4);
  ru.aiMemory.lastFailed = true;
  chooseIntents(engine.initialConfiguration, state, 3, () => {}); expect(ru.aiMemory.commitmentUntil).toBe(5);
});
it('sign preferences cannot force unsafe movement or bypass combat eligibility', () => {
  const setup = setupAI(); const engine = createMovementEngine(setup.scenario, setup.content); const state = copyJson(engine.snapshot()); state.tick = 1;
  const ru = state.ruStates['ru-player']!; ru.activeSignId = 'push-hard';
  state.ruStates['ru-iron']!.tile = { segmentId: 'seg-01', lane: 0 }; state.ruStates['ru-iron']!.speedMps = 0;
  chooseIntents(engine.initialConfiguration, state, 1, () => {});
  expect(ru.aiDecision!.chosen.mode).not.toBe('push');
  expect(ru.aiDecision!.candidates.find(candidate => candidate.mode === 'push' && candidate.laneDelta === 0)?.rejected).toBe('safety_braking_required');
  ru.activeSignId = 'attack'; chooseIntents(engine.initialConfiguration, state, 2, () => {}); planCombat(engine.initialConfiguration, state, 2, () => {}, []);
  expect(ru.combatDecision!.selected.every(plan => ru.combatDecision!.candidates.some(candidate => candidate.weaponId === plan.weaponId && candidate.targetRuId === plan.targetRuId && candidate.rejected === null))).toBe(true);
});
it('queues signs while paused, applies on the next tick, persists, charges replacement and lowers for free', () => {
  const setup = setupAI(); const engine = createRaceEngine(setup.scenario, setup.content);
  expect(engine.submit(sign('one')).accepted).toBe(true); expect(engine.snapshot().ruStates['ru-player']!.activeSignId).toBeNull();
  const one = engine.step(); expect(one.state.ruStates['ru-player']).toMatchObject({ activeSignId: 'conserve', signOpportunitiesRemaining: 2 });
  engine.step(); expect(engine.snapshot().ruStates['ru-player']!.activeSignId).toBe('conserve');
  engine.submit(sign('two', 'push-hard', 3)); engine.step(); expect(engine.snapshot().ruStates['ru-player']!.signOpportunitiesRemaining).toBe(1);
  engine.submit(lower('down', 4)); engine.step(); expect(engine.snapshot().ruStates['ru-player']).toMatchObject({ activeSignId: null, signOpportunitiesRemaining: 1 });
  engine.submit(sign('three', 'attack', 5)); engine.submit(sign('four', 'conserve', 5));
  const five = engine.step(); expect(five.state.ruStates['ru-player']).toMatchObject({ activeSignId: 'attack', signOpportunitiesRemaining: 0 });
  expect(five.events.find(event => event.type === 'command_rejected')).toBeDefined();
  engine.submit(lower('free', 6)); engine.step(); expect(engine.snapshot().ruStates['ru-player']).toMatchObject({ activeSignId: null, signOpportunitiesRemaining: 0 });
});
it('applies signs at countdown boundaries and preserves replayable order for same-tick commands', () => {
  const setup = setupAI(); setup.scenario.rules.countdownTicks = 3;
  setup.scenario.scriptedCommands = [sign('script', 'push-hard', 1) as typeof setup.scenario.scriptedCommands[number]];
  const engine = createRaceEngine(setup.scenario, setup.content);
  engine.submit(sign('replace', 'conserve')); engine.submit(lower('lower', 1));
  const first = engine.step(); expect(first.state.phase).toBe('countdown');
  expect(first.state.ruStates['ru-player']).toMatchObject({ activeSignId: null, signOpportunitiesRemaining: 1 });
  expect(first.events.filter(event => event.type === 'command_accepted')).toHaveLength(3);
});
it('rejects malformed, stale, duplicate, unauthorized and unknown commands without changing state', () => {
  const setup = setupAI(); const engine = createRaceEngine(setup.scenario, setup.content); const before = engine.snapshot();
  expect(engine.submit({ ...sign('bad'), signId: 'invented' }).accepted).toBe(false);
  expect(engine.submit(sign('other', 'conserve', 1, 'ru-iron')).accepted).toBe(false);
  expect(engine.submit(sign('missing', 'conserve', 1, 'not-found')).accepted).toBe(false);
  expect(engine.submit(sign('stale', 'conserve', 0)).accepted).toBe(false);
  expect(engine.submit(sign('unique')).accepted).toBe(true); expect(engine.submit(sign('unique')).accepted).toBe(false);
  expect(engine.snapshot()).toEqual(before);
  expect(engine.step().state.ruStates['ru-player']!.signOpportunitiesRemaining).toBe(2);
});
it('requires explicit permission for developer signs on opponents', () => {
  const setup = setupAI(); const command = { ...sign('dev', 'conserve', 1, 'ru-iron'), source: 'developer' };
  expect(createRaceEngine(setup.scenario, setup.content).submit(command).accepted).toBe(false);
  setup.scenario.rules.allowDeveloperSignCommands = true;
  const engine = createRaceEngine(setup.scenario, setup.content); expect(engine.submit(command).accepted).toBe(true);
  expect(engine.step().state.ruStates['ru-iron']!.activeSignId).toBe('conserve');
});
it('permits only registered paused overrides, logs old/new values and labels derived overrides', () => {
  const setup = setupAI(); const engine = createRaceEngine(setup.scenario, setup.content);
  const override = { type: 'developerOverride', source: 'developer', commandId: 'limit', effectiveTick: 1, ruId: 'ru-player', field: 'maxSpeedMps', value: 8 };
  expect(engine.submit(override).accepted).toBe(false);
  expect(engine.submit({ ...override, field: '__proto__' }, { paused: true }).accepted).toBe(false);
  expect(engine.submit({ ...override, value: NaN }, { paused: true }).accepted).toBe(false);
  expect(engine.submit(override, { paused: true }).accepted).toBe(true);
  const one = engine.step(); expect(one.state.ruStates['ru-player']!.derivedOverrides).toEqual({ maxSpeedMps: 8 });
  expect(one.state.ruStates['ru-player']!.derived.breakdown['override.maxSpeedMps']).toBe(8);
  expect(one.events.find(event => event.type === 'developer_override')).toMatchObject({ details: { oldValue: null, newValue: 8, source: 'developer', effectiveTick: 1 } });
  engine.submit({ ...override, commandId: 'clear', effectiveTick: 2, value: null }, { paused: true });
  expect(engine.step().state.ruStates['ru-player']!.derivedOverrides).toEqual({});
});
it('re-executes exported scripted/live command journals with identical hashes/events', () => {
  const setup = setupAI(); setup.scenario.scriptedCommands = [sign('script', 'conserve', 2) as typeof setup.scenario.scriptedCommands[number]];
  const engine = createRaceEngine(setup.scenario, setup.content);
  engine.submit(sign('one', 'push-hard')); engine.step();
  engine.submit({ type: 'developerOverride', source: 'developer', commandId: 'fatigue', effectiveTick: 2, ruId: 'ru-player', field: 'teamFatigue', value: 50 }, { paused: true });
  engine.step(); engine.submit(lower('lower', 3)); engine.step();
  const replayed = replayRace(JSON.parse(engine.exportBundle()));
  expect(replayed.latest()).toEqual(engine.latest()); expect(replayed.commandJournal()).toEqual(engine.commandJournal());
  expect(replayed.initialConfiguration).toEqual(engine.initialConfiguration);
});
it('keeps the AI stable under RU/configuration input reordering', () => {
  const setup = setupAI(); const a = createRaceEngine(setup.scenario, setup.content);
  setup.scenario.entries.reverse(); setup.content.drivers.reverse(); const b = createRaceEngine(setup.scenario, setup.content);
  for (let tick = 0; tick < 40; tick++) expect(b.step()).toEqual(a.step());
});
it('bounds command submissions and journals invalid numeric input without applying it', () => {
  const setup = setupAI(); setup.scenario.rules.maxCommandSubmissions = 2;
  const engine = createRaceEngine(setup.scenario, setup.content);
  expect(engine.submit({ type: 'developerOverride', source: 'developer', commandId: 'nan', effectiveTick: 1, ruId: 'ru-player', field: 'teamFatigue', value: NaN }, { paused: true }).accepted).toBe(false);
  expect(engine.submit(sign('ok')).accepted).toBe(true); expect(engine.submit(sign('overflow')).accepted).toBe(false);
  engine.step(); expect(engine.snapshot().ruStates['ru-player']!.teamFatigue).toBe(0);
  expect(engine.commandJournal()).toHaveLength(2);
  expect(JSON.parse(engine.exportBundle()).commandQueue.overflowRejections).toBe(1);
});
it('replays rejected submissions and queued future commands as well as applied inputs', () => {
  const setup = setupAI(); const engine = createRaceEngine(setup.scenario, setup.content);
  engine.submit(sign('future', 'conserve', 4)); engine.submit({ ...sign('invalid'), signId: 'bad' }); engine.step();
  const replayed = replayRace(JSON.parse(engine.exportBundle())); expect(replayed.latest()).toEqual(engine.latest());
  for (let tick = 0; tick < 3; tick++) expect(replayed.step()).toEqual(engine.step());
});
it('finishes 1,000 seeded AI/sign races without occupancy, finite-state or termination failures', { timeout: 60000 }, () => {
  const setup = setupAI(); const ids = ['ru-player', 'ru-iron', 'ru-vulture'];
  setup.scenario.entries = setup.scenario.entries.filter(entry => ids.includes(entry.id));
  setup.scenario.startingGrid = Object.fromEntries(ids.map((id, lane) => [id, { segmentId: 'seg-00', lane }]));
  setup.scenario.gridRows = [{ id: 'front', segmentId: 'seg-00', ruIds: ids }];
  setup.scenario.targetSpeedRatios = Object.fromEntries(ids.map(id => [id, 1]));
  setup.scenario.rules.laps = 1; setup.scenario.rules.maxTicks = 12; setup.scenario.rules.finishCutoffTicks = 2;
  setup.scenario.scriptedCommands = [sign('script-conserve', 'conserve', 1) as typeof setup.scenario.scriptedCommands[number], lower('script-lower', 3) as typeof setup.scenario.scriptedCommands[number]];
  const track = setup.content.tracks[0]!; track.segments = track.segments.slice(0, 4);
  track.segments.forEach((segment, i) => {
    segment.meters = 1; segment.kind = i === 1 || i === 2 ? 'corner' : 'straight'; segment.turn = segment.kind === 'corner' ? 'left' : 'none';
    segment.lanes.forEach(lane => { lane.next.segmentId = track.segments[(i + 1) % 4]!.id; lane.traction = .8; });
  });
  const tuning = setup.content.tuningProfiles[0]!; tuning.tickDurationSeconds = 1; tuning.stats.acceleration.base = 100;
  for (let seed = 0; seed < 1000; seed++) {
    setup.scenario.seed = `B2-AI-${seed}`; const engine = createRaceEngine(setup.scenario, setup.content);
    while (!['complete', 'error'].includes(engine.snapshot().phase)) {
      const frame = engine.step(); assertRaceState(copyJson(frame.state));
      for (const ru of Object.values(frame.state.ruStates)) expect(ru.signOpportunitiesRemaining).toBeGreaterThanOrEqual(0);
    }
    expect(engine.snapshot().phase, `seed ${seed}`).toBe('complete');
    expect(engine.snapshot().elapsedRaceTicks).toBeLessThanOrEqual(12);
  }
});
it('replays raw movement journals without imposing official race state', () => {
  const setup = setupAI(); const engine = createMovementEngine(setup.scenario, setup.content);
  engine.submit(sign('sign')); engine.step(); engine.step();
  const replayed = replayMovement(JSON.parse(engine.exportBundle())); expect(replayed.latest()).toEqual(engine.latest());
});
it('reproduces a failed tick and distinguishes later submissions at the same committed tick', () => {
  const setup = setupAI(); setup.content.tracks[0]!.segments.forEach(segment => { segment.meters = 1e-8; });
  setup.content.tuningProfiles[0]!.movement.maxTransitionsPerTick = 1;
  const engine = createRaceEngine(setup.scenario, setup.content); engine.submit(sign('before-failure')); engine.step();
  expect(engine.snapshot().phase).toBe('error');
  expect(engine.submit(sign('after-failure')).accepted).toBe(false);
  const replayed = replayRace(JSON.parse(engine.exportBundle())); expect(replayed.latest()).toEqual(engine.latest());
  expect(replayed.commandJournal()).toEqual(engine.commandJournal());
});

it.each(['constructor', '__proto__', 'toString', 'hasOwnProperty'])('rejects inherited command target %s without mutation or replay divergence', ruId => {
  const setup = setupAI(); const engine = createRaceEngine(setup.scenario, setup.content);
  const before = engine.snapshot();
  for (const source of ['player', 'developer'] as const) {
    const input = { ...sign(`invalid-${source}`, 'conserve', 1, ruId), source };
    expect(engine.submit(input, { paused: true }).accepted).toBe(false);
  }
  expect(engine.snapshot()).toEqual(before);
  const frame = engine.step();
  expect(frame.events.filter(event => event.type === 'command_rejected')).toHaveLength(2);
  expect(frame.state.ruStates['ru-player']!.signOpportunitiesRemaining).toBe(3);
  expect(replayRace(JSON.parse(engine.exportBundle())).latest()).toEqual(engine.latest());
});
