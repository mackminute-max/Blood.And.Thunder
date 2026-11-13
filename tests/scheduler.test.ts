import { expect, it } from 'vitest';
import { fixture } from './setup-fixture.ts';
import { createMovementEngine, assertMovementState } from '../src/simulation/core/movement-engine.ts';
import { moveTick } from '../src/simulation/movement/schedule.ts';
import { copyJson } from '../src/shared/immutable.ts';

function groupFixture(count = 2) {
  const setup = fixture(); const ids = ['ru-player', 'ru-iron', 'ru-vulture'].slice(0, count);
  setup.scenario.entries = setup.scenario.entries.filter(entry => ids.includes(entry.id));
  setup.scenario.startingGrid = Object.fromEntries(ids.map((id, i) => [id, { segmentId: `seg-0${i}`, lane: 0 }]));
  setup.scenario.gridRows = ids.map((id, i) => ({ id, segmentId: `seg-0${i}`, ruIds: [id] }));
  setup.scenario.targetSpeedRatios = Object.fromEntries(ids.map(id => [id, 1]));
  setup.content.tuningProfiles[0]!.tickDurationSeconds = 1;
  setup.content.tracks[0]!.segments.forEach(segment => { segment.meters = 1; });
  return setup;
}
function prepared(setup = groupFixture()) {
  const engine = createMovementEngine(setup.scenario, setup.content);
  const state = copyJson(engine.snapshot()); state.tick = 1;
  for (const ru of Object.values(state.ruStates)) { ru.speedMps = 1; ru.targetSpeedMps = 1; }
  return { config: engine.initialConfiguration, state };
}
it('commits exact-time vacated-tile chains atomically', () => {
  const { config, state } = prepared(); const result = moveTick(config, state);
  expect(result.events.map(event => event.type)).toEqual(['movement_transition', 'movement_transition']);
  expect(state.ruStates['ru-player']!.tile.segmentId).toBe('seg-01');
  expect(state.ruStates['ru-iron']!.tile.segmentId).toBe('seg-02');
  assertMovementState(state);
});
it('propagates a rejected departure backward without overlap', () => {
  const { config, state } = prepared(groupFixture(3));
  state.ruStates['ru-vulture']!.speedMps = 0; state.ruStates['ru-vulture']!.targetSpeedMps = 0;
  const result = moveTick(config, state);
  expect(result.events.filter(event => event.type === 'movement_blocked')).toHaveLength(2);
  expect(state.ruStates['ru-player']!.tile.segmentId).toBe('seg-00');
  expect(state.ruStates['ru-iron']!.tile.segmentId).toBe('seg-01');
  assertMovementState(state);
});
it('does not assume a destination will vacate later in the tick or retry discarded travel', () => {
  const { config, state } = prepared();
  state.ruStates['ru-player']!.speedMps = 2; state.ruStates['ru-player']!.targetSpeedMps = 2;
  const result = moveTick(config, state);
  expect(result.events.find(event => event.ruId === 'ru-player')).toMatchObject({ type: 'movement_blocked', fraction: .5, discardedMeters: 2 });
  expect(state.ruStates['ru-player']!.tile.segmentId).toBe('seg-00');
  expect(state.ruStates['ru-iron']!.tile.segmentId).toBe('seg-02');
});
it('preserves committed intermediate moves but discards remaining blocked travel', () => {
  const { config, state } = prepared(); state.ruStates['ru-iron']!.tile.segmentId = 'seg-02';
  state.ruStates['ru-iron']!.speedMps = 0; state.ruStates['ru-iron']!.targetSpeedMps = 0;
  state.ruStates['ru-player']!.speedMps = 3; state.ruStates['ru-player']!.targetSpeedMps = 3;
  const result = moveTick(config, state);
  expect(result.events.map(event => event.type)).toEqual(['movement_transition', 'movement_blocked']);
  expect(state.ruStates['ru-player']!.tile.segmentId).toBe('seg-01');
  expect(state.ruStates['ru-player']!.progressInSegment).toBe(0);
  expect(result.events[1]).toMatchObject({ discardedMeters: 2 });
});
it('arbitrates tied merge destinations by stability, independently of definition order', () => {
  const setup = groupFixture(); setup.scenario.startingGrid['ru-iron'] = { segmentId: 'seg-00', lane: 1 };
  setup.scenario.gridRows = [{ id: 'front', segmentId: 'seg-00', ruIds: ['ru-player', 'ru-iron'] }];
  setup.content.tracks[0]!.segments[0]!.lanes[1]!.next.lane = 0;
  const { config, state } = prepared(setup);
  const reversed = copyJson(state); reversed.ruStates = Object.fromEntries(Object.entries(reversed.ruStates).reverse());
  const expectedWinner = state.ruStates['ru-iron']!.derived.stability > state.ruStates['ru-player']!.derived.stability ? 'ru-iron' : 'ru-player';
  const output = moveTick(config, state); const alternate = moveTick(config, reversed);
  expect(output.events).toEqual(alternate.events);
  expect(output.events.find(event => event.type === 'movement_transition')?.ruId).toBe(expectedWinner);
  expect(output.events.find(event => event.type === 'movement_blocked')).toMatchObject({ reason: 'contested' });
  assertMovementState(state); assertMovementState(reversed);
});
it('records fractional physical line crossings without awarding a lap', () => {
  const { config, state } = prepared(); state.ruStates['ru-player']!.tile.segmentId = 'seg-47';
  state.ruStates['ru-player']!.progressInSegment = .5;
  const output = moveTick(config, state);
  expect(output.events.find(event => event.ruId === 'ru-player')).toMatchObject({ type: 'movement_transition', fraction: .47, crossedStartLine: true });
  expect(state.ruStates['ru-player']!.completedLaps).toBe(0);
});
it('rejects reciprocal exchanges in a two-segment circuit', () => {
  const setup = groupFixture(); const track = setup.content.tracks[0]!;
  track.segments = track.segments.slice(0, 2); track.segments[1]!.lanes.forEach(lane => { lane.next.segmentId = 'seg-00'; });
  const { config, state } = prepared(setup);
  expect(moveTick(config, state).events.every(event => event.type === 'movement_blocked' && event.reason === 'reciprocal')).toBe(true);
  assertMovementState(state);
});
