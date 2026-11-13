import { expect, it } from 'vitest';
import { fixture } from './setup-fixture.ts';
import { createMovementEngine, assertMovementState } from '../src/simulation/core/movement-engine.ts';
import { createRaceEngine, assertRaceState } from '../src/simulation/core/race-engine.ts';
import { moveTick } from '../src/simulation/movement/schedule.ts';
import { laneConditions } from '../src/simulation/movement/conditions.ts';
import { copyJson } from '../src/shared/immutable.ts';

function laneFixture(ids = ['ru-player']) {
  const setup = fixture();
  setup.scenario.entries = setup.scenario.entries.filter(entry => ids.includes(entry.id));
  setup.scenario.startingGrid = Object.fromEntries(ids.map((id, lane) => [id, { segmentId: 'seg-00', lane }]));
  setup.scenario.gridRows = [{ id: 'front', segmentId: 'seg-00', ruIds: ids }];
  setup.scenario.targetSpeedRatios = Object.fromEntries(ids.map(id => [id, 0]));
  setup.scenario.rules.allowStationaryLaneChange = true; setup.scenario.rules.maxTicks = 20;
  const track = setup.content.tracks[0]!; track.segments = track.segments.slice(0, 4);
  track.segments.forEach((segment, i) => {
    segment.kind = 'straight'; segment.turn = 'none'; segment.meters = 1;
    segment.lanes.forEach(lane => { lane.lengthMultiplier = 1; lane.next.segmentId = track.segments[(i + 1) % track.segments.length]!.id; });
  });
  setup.content.tuningProfiles[0]!.movement.respectSafeCornerSpeed = false;
  return setup;
}
const engineFor = (setup: ReturnType<typeof fixture>) => createMovementEngine(setup.scenario, setup.content);
const plan = (ruId: string, laneDelta: -1 | 1, abortIfBlocked = false, movementTick = 1) => ({ ruId, laneDelta, abortIfBlocked, movementTick });
it('performs favorable lane changes without speed/progress loss or RNG draws', () => {
  const setup = laneFixture(); setup.scenario.maneuvers = [plan('ru-player', 1)];
  const engine = engineFor(setup); const state = copyJson(engine.snapshot()); state.tick = 1;
  const ru = state.ruStates['ru-player']!; ru.progressInSegment = .3; ru.speedMps = 1; ru.targetSpeedMps = 1;
  const rngBefore = copyJson(state.rngStates.movement);
  const output = moveTick(engine.initialConfiguration, state);
  expect(output.events.find(event => event.type === 'lane_change_resolved')).toMatchObject({ accepted: true, reason: 'accepted', speedBefore: 1, speedAfter: 1, probability: 1, roll: null });
  expect(ru.tile).toEqual({ segmentId: 'seg-00', lane: 1 }); expect(ru.progressInSegment).toBeCloseTo(.5);
  expect(ru.speedMps).toBe(1); expect(state.rngStates.movement).toEqual(rngBefore);
});
it('resolves reciprocal swaps by rejecting both, preserving legal occupancy', () => {
  const setup = laneFixture(['ru-player', 'ru-iron']); setup.scenario.maneuvers = [plan('ru-player', 1), plan('ru-iron', -1)];
  const output = engineFor(setup).step();
  expect(output.events.filter(event => event.type === 'lane_change_resolved').every(event => event.reason === 'reciprocal' && !event.accepted)).toBe(true);
  expect(output.state.ruStates['ru-player']!.tile.lane).toBe(0); expect(output.state.ruStates['ru-iron']!.tile.lane).toBe(1);
  assertMovementState(copyJson(output.state));
});
it('accepts a lateral chain only when all departures succeed', () => {
  const setup = laneFixture(['ru-player', 'ru-iron']); setup.scenario.maneuvers = [plan('ru-player', 1), plan('ru-iron', 1)];
  const output = engineFor(setup).step();
  expect(output.state.ruStates['ru-player']!.tile.lane).toBe(1); expect(output.state.ruStates['ru-iron']!.tile.lane).toBe(2);
  setup.content.tracks[0]!.segments[0]!.lanes[2]!.traction = .5;
  setup.content.tuningProfiles[0]!.movement.handling.minProbability = 0; setup.content.tuningProfiles[0]!.movement.handling.maxProbability = 0;
  const failed = engineFor(setup).step();
  expect(failed.state.ruStates['ru-player']!.tile.lane).toBe(0); expect(failed.state.ruStates['ru-iron']!.tile.lane).toBe(1);
  expect(failed.events.find(event => event.type === 'lane_change_resolved' && event.ruId === 'ru-player')).toMatchObject({ accepted: false, reason: 'occupied' });
});
it('arbitrates contested lateral destinations deterministically under input reordering', () => {
  const setup = laneFixture(['ru-player', 'ru-iron']); setup.scenario.startingGrid['ru-iron']!.lane = 2;
  setup.scenario.maneuvers = [plan('ru-player', 1), plan('ru-iron', -1)];
  const a = engineFor(setup); setup.scenario.entries.reverse(); setup.scenario.maneuvers.reverse(); const b = engineFor(setup);
  const output = a.step(); expect(b.step()).toEqual(output);
  expect(output.events.filter(event => event.type === 'lane_change_resolved' && event.accepted)).toHaveLength(1);
  assertMovementState(copyJson(output.state));
});
it.each(['bounds', 'connection', 'stationary'] as const)('rejects %s maneuvers and permits forward fallback', reason => {
  const setup = laneFixture(); setup.scenario.targetSpeedRatios['ru-player'] = 1;
  setup.scenario.maneuvers = [plan('ru-player', reason === 'bounds' ? -1 : 1)];
  if (reason === 'connection') { setup.content.tracks[0]!.segments[0]!.lanes[0]!.lateralNeighbors = []; setup.content.tracks[0]!.segments[0]!.lanes[1]!.lateralNeighbors = [2]; }
  if (reason === 'stationary') setup.scenario.rules.allowStationaryLaneChange = false;
  const output = engineFor(setup).step();
  expect(output.events.find(event => event.type === 'lane_change_resolved')).toMatchObject({ accepted: false, reason: reason === 'stationary' ? 'stationary' : 'invalid_connection' });
  expect(output.state.ruStates['ru-player']!.progressInSegment).toBeGreaterThan(0);
});
it('supports abortIfBlocked without banking travel, without canceling other units', () => {
  const setup = laneFixture(['ru-player', 'ru-iron']); setup.scenario.targetSpeedRatios = { 'ru-player': 1, 'ru-iron': 1 };
  setup.scenario.maneuvers = [plan('ru-player', 1, true)];
  const engine = engineFor(setup); const one = engine.step(); const two = engine.step();
  expect(one.state.ruStates['ru-player']!.progressInSegment).toBe(0);
  expect(one.state.ruStates['ru-iron']!.progressInSegment).toBeGreaterThan(0);
  expect(two.state.ruStates['ru-player']!.progressInSegment).toBeGreaterThan(0);
  expect(one.diagnostics.find(record => record.message === 'Integrated fixed-tick movement intent' && record.ruId === 'ru-player')?.details).toMatchObject({ abortForward: true });
});
it('reproduces seeded difficult control failure and its explicit speed effect', () => {
  const setup = laneFixture(); setup.scenario.maneuvers = [plan('ru-player', 1)];
  setup.content.tracks[0]!.segments[0]!.lanes[1]!.traction = .5;
  const t = setup.content.tuningProfiles[0]!.movement.handling; t.minProbability = 0; t.maxProbability = 0;
  const a = engineFor(setup); const state = copyJson(a.snapshot()); state.tick = 1; state.ruStates['ru-player']!.speedMps = 1;
  const alternate = copyJson(state); const output = moveTick(a.initialConfiguration, state);
  expect(moveTick(a.initialConfiguration, alternate)).toEqual(output);
  expect(output.events.find(event => event.type === 'lane_change_resolved')).toMatchObject({ accepted: false, reason: 'handling_failure', probability: 0, speedBefore: 1, speedAfter: .9 });
  expect(state.ruStates['ru-player']!.tile.lane).toBe(0);
});
it('applies corner lane length/safe-speed tradeoffs without forcing a winner', () => {
  const setup = laneFixture(); setup.content.tracks[0]!.segments[0]!.kind = 'corner';
  const lanes = setup.content.tracks[0]!.segments[0]!.lanes;
  lanes[0]!.lengthMultiplier = .94; lanes[0]!.cornerSpeedFactor = .72;
  lanes[3]!.lengthMultiplier = 1.06; lanes[3]!.cornerSpeedFactor = .93;
  const engine = engineFor(setup); const ru = engine.snapshot().ruStates['ru-player']!;
  expect(laneConditions(engine.initialConfiguration, { segmentId: 'seg-00', lane: 0 }, ru.derived.maxSpeedMps, ru.derived.handling).safeSpeed).toBeLessThan(laneConditions(engine.initialConfiguration, { segmentId: 'seg-00', lane: 3 }, ru.derived.maxSpeedMps, ru.derived.handling).safeSpeed);
  setup.scenario.targetSpeedRatios['ru-player'] = 1; setup.content.tuningProfiles[0]!.movement.respectSafeCornerSpeed = true;
  const result = engineFor(setup).step();
  expect(result.state.ruStates['ru-player']!.targetSpeedMps).toBeLessThan(result.state.ruStates['ru-player']!.derived.maxSpeedMps);
});
it('checks overspeed once on corner entry and adjusts remaining movement/time after failure', () => {
  const setup = laneFixture(); setup.content.tracks[0]!.segments.forEach(segment => { segment.meters = .1; });
  setup.content.tracks[0]!.segments[1]!.kind = 'corner'; setup.content.tracks[0]!.segments[1]!.turn = 'left';
  setup.content.tracks[0]!.segments[2]!.kind = 'corner'; setup.content.tracks[0]!.segments[2]!.turn = 'left';
  for (const segment of setup.content.tracks[0]!.segments.slice(1, 3)) segment.lanes[0]!.cornerSpeedFactor = .01;
  const t = setup.content.tuningProfiles[0]!.movement.handling; t.minProbability = 0; t.maxProbability = 0; t.failureSpeedFactor = .5;
  const engine = engineFor(setup); const state = copyJson(engine.snapshot()); state.tick = 1;
  state.ruStates['ru-player']!.speedMps = 1; state.ruStates['ru-player']!.targetSpeedMps = 1;
  const result = moveTick(engine.initialConfiguration, state);
  expect(result.events.filter(event => event.type === 'handling_check')).toHaveLength(1);
  expect(result.events.find(event => event.type === 'handling_check')).toMatchObject({ accepted: false, speedBefore: 1, speedAfter: .5, fraction: .5 });
  expect(state.ruStates['ru-player']!.tile.segmentId).toBe('seg-01');
  expect(state.ruStates['ru-player']!.progressInSegment).toBeCloseTo(.5);
});
it('warns then retires a repeatedly blocked RU without illegal relocation', () => {
  const setup = laneFixture(['ru-player', 'ru-iron']); setup.scenario.startingGrid['ru-iron'] = { segmentId: 'seg-01', lane: 0 };
  setup.scenario.gridRows = [{ id: 'front', segmentId: 'seg-00', ruIds: ['ru-player'] }, { id: 'other', segmentId: 'seg-01', ruIds: ['ru-iron'] }];
  setup.scenario.targetSpeedRatios['ru-player'] = 1;
  setup.content.tracks[0]!.segments.forEach(segment => { segment.meters = .001; });
  const t = setup.content.tuningProfiles[0]!.movement.conflict; t.deadlockWarningTicks = 2; t.deadlockRecoveryTicks = 3;
  const engine = engineFor(setup); engine.step();
  expect(engine.step().diagnostics.some(record => record.level === 'warning')).toBe(true);
  const last = engine.step();
  expect(last.state.ruStates['ru-player']).toMatchObject({ status: 'retired', statusReason: 'deadlock_recovery', tile: { segmentId: 'seg-00', lane: 0 } });
  expect(last.events.some(event => event.type === 'movement_recovery')).toBe(true);
});
it('uses movement ticks for plans even when the race has a countdown', () => {
  const setup = laneFixture(); setup.scenario.maneuvers = [plan('ru-player', 1)]; setup.scenario.rules.countdownTicks = 2;
  const engine = createRaceEngine(setup.scenario, setup.content);
  expect(engine.step().events.some(event => event.type === 'lane_change_attempt')).toBe(false);
  engine.step(); const moved = engine.step();
  expect(moved.state.ruStates['ru-player']!.tile.lane).toBe(1); expect(moved.state.elapsedRaceTicks).toBe(1);
  expect(moved.state.ruStates['ru-player']!.acceptedTransitions).toBe(0); assertRaceState(copyJson(moved.state));
});
it('rejects duplicate per-RU/tick plans, unknown IDs, multi-lane deltas and out-of-range ticks', () => {
  for (const maneuvers of [[plan('ru-player', 1), plan('ru-player', -1)], [plan('missing', 1)], [{ ...plan('ru-player', 1), laneDelta: 2 }], [plan('ru-player', 1, false, 100)]]) {
    const setup = laneFixture(); expect(() => createMovementEngine({ ...setup.scenario, maneuvers }, setup.content)).toThrow();
  }
});
it('applies an explicit brake response when closing stopping distance exceeds available room', () => {
  const setup = laneFixture(['ru-player', 'ru-iron']); setup.scenario.startingGrid['ru-iron'] = { segmentId: 'seg-01', lane: 0 };
  setup.scenario.gridRows = [{ id: 'front', segmentId: 'seg-00', ruIds: ['ru-player'] }, { id: 'rear', segmentId: 'seg-01', ruIds: ['ru-iron'] }];
  const engine = engineFor(setup); const state = copyJson(engine.snapshot()); state.tick = 1;
  state.ruStates['ru-player']!.speedMps = 10; state.ruStates['ru-player']!.targetSpeedMps = 10;
  const result = moveTick(engine.initialConfiguration, state);
  expect(result.events.find(event => event.type === 'movement_blocked')).toMatchObject({ outcome: 'brake', reason: 'occupied', discardedMeters: 2 });
  expect(state.ruStates['ru-player']!.speedMps).toBe(7.5); expect(state.ruStates['ru-player']!.driver.health).toBe(100);
});
it('keeps fractional arrival times consistent after a mid-tick corner speed change', () => {
  const setup = laneFixture(); const segments = setup.content.tracks[0]!.segments;
  segments.forEach(segment => { segment.meters = .1; }); segments[1]!.kind = 'corner'; segments[1]!.turn = 'left'; segments[1]!.lanes[0]!.cornerSpeedFactor = .01;
  const t = setup.content.tuningProfiles[0]!.movement.handling; t.minProbability = 0; t.maxProbability = 0; t.failureSpeedFactor = .5;
  const engine = engineFor(setup); const state = copyJson(engine.snapshot()); state.tick = 1;
  state.ruStates['ru-player']!.speedMps = 2; state.ruStates['ru-player']!.targetSpeedMps = 2;
  const result = moveTick(engine.initialConfiguration, state);
  const transitions = result.events.filter(event => event.type === 'movement_transition');
  expect(transitions[0]!.fraction).toBeCloseTo(.25);
  expect(transitions[1]!.fraction).toBeCloseTo(.75);
  expect(state.ruStates['ru-player']!.progressInSegment).toBeCloseTo(.5);
});
it('terminates 1,000 seeded maneuver races without illegal occupancy or nonfinite state', { timeout: 60000 }, () => {
  const setup = laneFixture(['ru-player', 'ru-iron', 'ru-vulture']);
  setup.scenario.rules.laps = 1; setup.scenario.rules.maxTicks = 12; setup.scenario.rules.finishCutoffTicks = 2;
  setup.scenario.targetSpeedRatios = { 'ru-player': 1, 'ru-iron': .8, 'ru-vulture': .9 };
  setup.scenario.maneuvers = [plan('ru-player', 1), plan('ru-iron', 1), plan('ru-vulture', 1)];
  const t = setup.content.tuningProfiles[0]!; t.tickDurationSeconds = 1;
  t.stats.speed.base = 10; t.stats.speed.perTeamSpeed = 0; t.stats.speed.rollingBase = 1; t.stats.speed.rollingScale = 0;
  t.stats.acceleration.base = 100; t.stats.acceleration.perTeamPower = 0;
  t.movement.conflict.deadlockWarningTicks = 2; t.movement.conflict.deadlockRecoveryTicks = 5;
  setup.content.chariots.forEach(chariot => { chariot.weightKg = 140; });
  setup.content.tracks[0]!.segments.forEach((segment, i) => {
    if (i === 1 || i === 2) { segment.kind = 'corner'; segment.turn = 'left'; }
    segment.lanes.forEach(lane => { lane.traction = .7; lane.cornerSpeedFactor = .7 + lane.index * .05; });
  });
  for (let seed = 0; seed < 1000; seed++) {
    setup.scenario.seed = `B1-BATCH-${seed}`;
    const engine = createRaceEngine(setup.scenario, setup.content);
    while (!['complete', 'error'].includes(engine.snapshot().phase)) assertRaceState(copyJson(engine.step().state));
    expect(engine.snapshot().phase, `seed ${seed}`).toBe('complete');
    expect(engine.snapshot().elapsedRaceTicks).toBeLessThanOrEqual(12);
    expect(engine.result()!.outcome).toBe('classified');
  }
});
it('preserves approved rear-row lap accounting during lateral movement', () => {
  const setup = laneFixture(); setup.scenario.startingGrid['ru-player']!.segmentId = 'seg-03'; setup.scenario.gridRows[0]!.segmentId = 'seg-03';
  setup.scenario.maneuvers = [plan('ru-player', 1)];
  const engine = createRaceEngine(setup.scenario, setup.content); const output = engine.step();
  expect(output.state.ruStates['ru-player']).toMatchObject({ tile: { segmentId: 'seg-03', lane: 1 }, normalizedCoursePosition: -1, hasStartedLap: false, completedLaps: 0, startLineCrossings: 0, acceptedTransitions: 0 });
  expect(output.events.some(event => event.type === 'lap_started' || event.type === 'lap_crossed')).toBe(false);
  assertRaceState(copyJson(output.state));
});
