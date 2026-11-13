import { describe, expect, it } from 'vitest';
import { fixture } from './setup-fixture.ts';
import { initializeRace } from '../src/simulation/core/initialize.ts';
import { createMovementEngine, assertMovementState } from '../src/simulation/core/movement-engine.ts';
import { integrateSpeed } from '../src/simulation/movement/integrate.ts';
import { deriveStats } from '../src/simulation/entities/derive.ts';
import { copyJson } from '../src/shared/immutable.ts';
import { stateHash, canonicalState } from '../src/diagnostics/state-hash.ts';

function movementFixture(ids = ['ru-player']) {
  const setup = fixture();
  setup.scenario.entries = setup.scenario.entries.filter(entry => ids.includes(entry.id));
  setup.scenario.startingGrid = Object.fromEntries(Object.entries(setup.scenario.startingGrid).filter(([id]) => ids.includes(id)));
  setup.scenario.gridRows = setup.scenario.gridRows.map(row => ({ ...row, ruIds: row.ruIds.filter(id => ids.includes(id)) })).filter(row => row.ruIds.length);
  setup.scenario.targetSpeedRatios = Object.fromEntries(ids.map(id => [id, 1]));
  if (!ids.includes('ru-player')) setup.scenario.mode = 'headless';
  return setup;
}
function engineFor(setup: ReturnType<typeof fixture>) { return createMovementEngine(setup.scenario, setup.content); }

describe('provisional B.3 derivation', () => {
  it('matches the hand-calculated healthy player baseline and exposes modifiers', () => {
    const engine = engineFor(movementFixture());
    const stats = engine.snapshot().ruStates['ru-player']!.derived;
    expect(stats.breakdown.coordination).toBeCloseTo(0.9125);
    expect(stats.breakdown.teamSpeed).toBeCloseTo(63.875);
    expect(stats.maxSpeedMps).toBeCloseTo((5 + .12 * 63.875) * .925);
    expect(stats.accelMps2).toBeCloseTo(.6 + .025 * 63.875);
    expect(stats.brakeMps2).toBeCloseTo(1.2 + .018 * 59.3125 + .01 * 70);
    expect(stats.handling).toBeCloseTo(.3 * 59.3125 + .25 * 70 + .25 * 70 + .2 * 70);
    expect(stats.stability).toBeCloseTo(.5 * 65 + .2 * 65 + .3 * 70);
    expect(stats.endurance).toBeCloseTo(.75 * 70 + .25 * 70);
  });
  it('recalculates from independent beast condition, driver, load, fatigue and traction', () => {
    const setup = movementFixture(); const original = engineFor(setup).snapshot().ruStates['ru-player']!.derived;
    setup.content.beasts.find(beast => beast.id === 'beast-player-1')!.currentHealth = 0;
    setup.content.chariots.find(cart => cart.id === 'chariot-player')!.weightKg = 300;
    const initialized = initializeRace(setup.scenario, setup.content);
    const ru = copyJson(initialized.snapshot().ruStates['ru-player']!);
    const derived = deriveStats(initialized.initialConfiguration, { ...ru, teamFatigue: 90 });
    expect(derived.breakdown['conditionFactor.beast-player-1']).toBe(.2);
    expect(derived.breakdown['conditionFactor.beast-player-2']).toBe(1);
    expect(derived.breakdown.fatigueFactor).toBe(.5);
    expect(derived.maxSpeedMps).toBeLessThan(original.maxSpeedMps);
    expect(derived.accelMps2).toBeLessThan(original.accelMps2);
    setup.content.drivers.find(driver => driver.id === 'driver-player')!.currentHealth = 0;
    expect(engineFor(setup).snapshot().ruStates['ru-player']!.derived.maxSpeedMps).toBe(0);
  });
  it('uses editable formula coefficients and local traction for braking', () => {
    const setup = movementFixture();
    const original = engineFor(setup).snapshot().ruStates['ru-player']!.derived;
    setup.content.tuningProfiles[0]!.stats.speed.base += 10;
    setup.content.tracks[0]!.segments[0]!.lanes[0]!.traction = .5;
    const changed = engineFor(setup).snapshot().ruStates['ru-player']!.derived;
    expect(changed.maxSpeedMps - original.maxSpeedMps).toBeCloseTo(9.25);
    expect(changed.brakeMps2).toBeCloseTo(original.brakeMps2 * .5);
  });
});

it('integrates acceleration/braking exactly once, clamps target/max and uses trapezoidal meters', () => {
  const start = integrateSpeed(0, 10, 2, 4, 20, .2);
  expect(start.speedMps).toBeCloseTo(.4); expect(start.travelMeters).toBeCloseTo(.04);
  expect(integrateSpeed(10, 0, 2, 4, 20, .5)).toEqual({ speedMps: 8, travelMeters: 4.5 });
  expect(integrateSpeed(5, 6, 100, 100, 6, 1)).toEqual({ speedMps: 6, travelMeters: 5.5 });
  expect(() => integrateSpeed(0, Infinity, 1, 1, 10, .2)).toThrow();
});
it('carries ordinary fractional movement forward and retains old immutable snapshots', () => {
  const engine = engineFor(movementFixture()); const initial = engine.snapshot();
  const one = engine.step(); const two = engine.step();
  const acceleration = initial.ruStates['ru-player']!.derived.accelMps2;
  expect(one.state.ruStates['ru-player']!.progressInSegment).toBeCloseTo(acceleration * .2 * .1 / 10);
  expect(two.state.ruStates['ru-player']!.progressInSegment).toBeGreaterThan(one.state.ruStates['ru-player']!.progressInSegment);
  expect(initial.tick).toBe(0); expect(one.state.tick).toBe(1); expect(two.state.tick).toBe(2);
  expect(Reflect.set(two.state.ruStates['ru-player']!.derived, 'maxSpeedMps', 999)).toBe(false);
});
it('checks every intermediate tile and records line crossings without awarding laps', () => {
  const setup = movementFixture(); setup.content.tracks[0]!.segments.forEach(segment => { segment.meters = .01; });
  const engine = engineFor(setup); const output = engine.step();
  const transitions = output.events.filter(event => event.type === 'movement_transition');
  expect(transitions.length).toBeGreaterThan(3);
  expect(transitions[0]).toMatchObject({ from: { segmentId: 'seg-00', lane: 0 }, to: { segmentId: 'seg-01', lane: 0 } });
  for (let i = 1; i < transitions.length; i++) {
    expect(transitions[i]!.from).toEqual(transitions[i - 1]!.to);
    expect(transitions[i]!.fraction).toBeGreaterThan(transitions[i - 1]!.fraction);
  }
  expect(output.state.ruStates['ru-player']!.completedLaps).toBe(0);
  expect(output.diagnostics.some(diagnostic => diagnostic.message === 'Accepted intermediate transition')).toBe(true);
});
it('uses each lane traversal cost rather than ignoring lane length', () => {
  const setup = movementFixture();
  setup.content.tracks[0]!.segments[0]!.lanes[0]!.lengthMultiplier = 2;
  const engine = engineFor(setup); const result = engine.step().state.ruStates['ru-player']!;
  expect(result.progressInSegment).toBeCloseTo(result.speedMps * .1 / 20);
});
it('discards blocked meters every tick without damaging or automatically slowing the follower', () => {
  const setup = movementFixture(['ru-player', 'ru-iron']);
  setup.scenario.startingGrid['ru-iron'] = { segmentId: 'seg-01', lane: 0 };
  setup.scenario.gridRows = [{ id: 'front', segmentId: 'seg-00', ruIds: ['ru-player'] }, { id: 'obstacle', segmentId: 'seg-01', ruIds: ['ru-iron'] }];
  setup.scenario.targetSpeedRatios['ru-iron'] = 0;
  setup.content.tuningProfiles[0]!.stats.braking.base = 1000; // Ample braking room: exercise clean yield, not B1's brake outcome.
  setup.content.tracks[0]!.segments.forEach(segment => { segment.meters = .01; });
  const engine = engineFor(setup);
  const one = engine.step(); const two = engine.step();
  expect(one.events).toContainEqual(expect.objectContaining({ type: 'movement_blocked', reason: 'occupied', outcome: 'yield' }));
  const firstRu = one.state.ruStates['ru-player']!;
  expect(firstRu.tile.segmentId).toBe('seg-00'); expect(firstRu.progressInSegment).toBe(0);
  expect(two.state.ruStates['ru-player']!.blockedTicks).toBe(2);
  expect(two.state.ruStates['ru-player']!.speedMps).toBeGreaterThan(firstRu.speedMps);
  expect(two.state.ruStates['ru-player']!.driver.health).toBe(100);
  const blocked = two.events.find(event => event.type === 'movement_blocked')!;
  expect(blocked.type === 'movement_blocked' && blocked.discardedMeters).toBeCloseTo((firstRu.speedMps + two.state.ruStates['ru-player']!.speedMps) / 2 * .2);
});
it('halts transactionally on transition cap with exportable last valid state', () => {
  const setup = movementFixture(); setup.content.tracks[0]!.segments.forEach(segment => { segment.meters = 1e-6; });
  const engine = engineFor(setup); const before = engine.snapshot(); const output = engine.step();
  expect(output.state.phase).toBe('error'); expect(output.state.tick).toBe(0);
  expect(output.state.ruStates).toEqual(before.ruStates);
  expect(output.diagnostics.at(-1)?.message).toContain('Transition cap');
  expect(JSON.parse(engine.exportBundle()).lastValidState.phase).toBe('grid');
  expect(() => engine.step()).toThrow('Cannot step error');
});
it('bounds the movement harness without claiming a race classification', () => {
  const setup = movementFixture(); setup.scenario.rules.maxTicks = 2;
  const engine = engineFor(setup); engine.step(); const last = engine.step();
  expect(last.state.phase).toBe('halted'); expect(last.state.haltReason).toBe('tick_limit');
  expect(last.state.finishRecords).toEqual([]); expect(() => engine.step()).toThrow();
});
it('repeats state hashes/events under reordered RU inputs and different stepping batches', () => {
  const setup = fixture(); const a = engineFor(setup);
  setup.scenario.entries.reverse(); setup.content.beasts.reverse(); const b = engineFor(setup);
  const expected = Array.from({ length: 120 }, () => a.step());
  const actual = []; for (let batch = 0; batch < 12; batch++) for (let tick = 0; tick < 10; tick++) actual.push(b.step());
  expect(actual).toEqual(expected);
  actual.forEach(output => assertMovementState(copyJson(output.state)));
});
it('canonicalizes keys/precision, retains semantic array order and rejects nonfinite state', () => {
  expect(stateHash({ a: 1, b: 2 })).toBe(stateHash({ b: 2, a: 1 }));
  expect(canonicalState({ a: 1.00000000001 })).toBe('{"a":1}');
  expect(stateHash([1, 2])).not.toBe(stateHash([2, 1]));
  expect(() => stateHash(NaN)).toThrow();
});
