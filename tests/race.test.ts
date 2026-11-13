import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fixture } from './setup-fixture.ts';
import { scenarioSchema } from '../src/configuration/schemas.ts';
import { createRaceEngine, assertRaceState } from '../src/simulation/core/race-engine.ts';
import { rankFinishes } from '../src/simulation/rules/classification.ts';
import { copyJson } from '../src/shared/immutable.ts';
import { stateHash } from '../src/diagnostics/state-hash.ts';

function circuitFixture() {
  const { content } = fixture();
  const scenario = scenarioSchema.parse(JSON.parse(readFileSync(new URL('../src/content/oval-front-four-a3.scenario.json', import.meta.url), 'utf8')));
  const track = content.tracks[0]!;
  track.segments = track.segments.slice(0, 4);
  track.segments.forEach((segment, i) => {
    segment.meters = 1; segment.kind = 'straight'; segment.turn = 'none';
    segment.lanes.forEach(lane => { lane.lengthMultiplier = 1; lane.next.segmentId = track.segments[(i + 1) % 4]!.id; });
  });
  const tuning = content.tuningProfiles[0]!;
  tuning.tickDurationSeconds = 1;
  tuning.stats.acceleration.base = 100; tuning.stats.acceleration.perTeamPower = 0;
  tuning.stats.speed.base = 10; tuning.stats.speed.perTeamSpeed = 0;
  tuning.stats.speed.rollingBase = 1; tuning.stats.speed.rollingScale = 0;
  content.chariots.forEach(chariot => { chariot.weightKg = 140; });
  scenario.rules.laps = 1;
  scenario.rules.maxTicks = 20;
  return { scenario, content };
}
const race = (setup = circuitFixture()) => createRaceEngine(setup.scenario, setup.content);

describe('A3 circuit lifecycle', () => {
  it('does not award a lap on initialization and finishes at a fractional boundary', () => {
    const engine = race(); const initial = engine.snapshot();
    expect(initial.phase).toBe('grid'); expect(initial.ruStates['ru-player']!.completedLaps).toBe(0);
    const output = engine.step();
    expect(output.state.phase).toBe('complete');
    for (const ru of Object.values(output.state.ruStates)) {
      expect(ru.completedLaps).toBe(1); expect(ru.startLineCrossings).toBe(1);
      expect(ru.acceptedTransitions).toBe(4); // Stops at finish despite 5 m budget.
      expect(ru.finishTimeSeconds).toBeCloseTo(.8);
      expect(ru.tile.segmentId).toBe('seg-00'); expect(ru.normalizedCoursePosition).toBe(4);
      expect(ru.speedMps).toBe(0);
    }
    expect(output.state.result?.winnerIds).toHaveLength(4);
    expect(output.events.filter(event => event.type === 'ru_finished')).toHaveLength(4);
    expect(output.events.filter(event => event.type === 'lap_crossed')).toHaveLength(4);
    expect(output.events[0]?.type).toBe('race_started');
    expect(output.events.at(-1)?.type).toBe('race_finished');
    expect(new Set(output.events.map(event => event.id)).size).toBe(output.events.length);
    expect(initial.tick).toBe(0); expect(() => engine.step()).toThrow('Cannot step complete');
    assertRaceState(copyJson(output.state));
  });
  it('counts multiple accepted lap crossings and stops after configured laps', () => {
    const setup = circuitFixture(); setup.scenario.rules.laps = 3;
    const engine = race(setup); const one = engine.step();
    expect(one.state.ruStates['ru-player']!.completedLaps).toBe(1);
    const two = engine.step();
    expect(two.state.phase).toBe('complete');
    expect(two.state.ruStates['ru-player']!.completedLaps).toBe(3);
    expect(two.state.ruStates['ru-player']!.acceptedTransitions).toBe(12);
    expect(two.state.ruStates['ru-player']!.finishTimeSeconds).toBeCloseTo(1.7);
  });
  it('keeps countdown timing outside the race clock and watchdog', () => {
    const setup = circuitFixture(); setup.scenario.rules.countdownTicks = 3;
    const engine = race(setup);
    expect(engine.step().state.phase).toBe('countdown');
    expect(engine.step().state.countdownRemaining).toBe(1);
    const started = engine.step();
    expect(started.state.phase).toBe('running'); expect(started.state.elapsedRaceTicks).toBe(0);
    expect(started.state.ruStates['ru-player']!.speedMps).toBe(0);
    expect(started.events.at(-1)?.type).toBe('race_started');
    const finished = engine.step(); expect(finished.state.tick).toBe(4);
    expect(finished.state.result?.classification[0]?.finishTimeSeconds).toBeCloseTo(.8);
  });
  it('orders same-tick finishes by fraction rather than ID and preserves true ties', () => {
    const setup = circuitFixture();
    setup.scenario.targetSpeedRatios['ru-iron'] = .8;
    setup.scenario.targetSpeedRatios['ru-vulture'] = .9;
    const engine = race(setup); const result = engine.runUntilComplete()!;
    expect(result.winnerIds).toEqual(['ru-ash', 'ru-player']);
    expect(result.classification.find(entry => entry.ruId === 'ru-player')?.rank).toBe(1);
    expect(result.classification.find(entry => entry.ruId === 'ru-vulture')?.rank).toBe(3);
    expect(result.classification.find(entry => entry.ruId === 'ru-iron')?.rank).toBe(4);
  });
  it('uses normalized progress for standings rather than physical meters', () => {
    const setup = circuitFixture(); setup.scenario.rules.laps = 5;
    setup.content.tracks[0]!.segments[0]!.lanes[0]!.lengthMultiplier = 2;
    const engine = race(setup); const output = engine.step();
    expect(output.state.ruStates['ru-player']!.normalizedCoursePosition).toBe(4);
    expect(output.state.ruStates['ru-iron']!.normalizedCoursePosition).toBe(5);
    expect(output.state.standings.findIndex(entry => entry.ruId === 'ru-player')).toBe(3);
    expect(output.state.standings.every(entry => entry.rank === null)).toBe(true);
  });
  it.each([0, 2])('classifies cutoff DNFs after %s extra race ticks', cutoff => {
    const setup = circuitFixture(); setup.scenario.rules.finishCutoffTicks = cutoff;
    setup.scenario.targetSpeedRatios['ru-iron'] = 0;
    const engine = race(setup); const first = engine.step();
    expect(first.state.phase).toBe(cutoff === 0 ? 'complete' : 'concluding');
    const result = engine.runUntilComplete()!;
    expect(result.endTick).toBe(1 + cutoff);
    expect(result.classification.find(entry => entry.ruId === 'ru-iron')).toMatchObject({ status: 'dnf', reason: 'finish_cutoff', rank: null });
  });
  it('classifies watchdog DNFs, excluding countdown ticks, with no fabricated winner', () => {
    const setup = circuitFixture(); setup.scenario.rules.countdownTicks = 3; setup.scenario.rules.maxTicks = 2;
    Object.keys(setup.scenario.targetSpeedRatios).forEach(id => { setup.scenario.targetSpeedRatios[id] = 0; });
    const engine = race(setup); const result = engine.runUntilComplete()!;
    expect(result.endTick).toBe(5); expect(result.elapsedRaceSeconds).toBe(2);
    expect(result.winnerIds).toEqual([]);
    expect(result.classification.every(entry => entry.status === 'dnf' && entry.reason === 'race_timeout')).toBe(true);
  });
  it('preserves disabled reasons and component state while finishing active entries', () => {
    const setup = circuitFixture(); setup.content.drivers.find(driver => driver.id === 'driver-iron')!.currentHealth = 0;
    const result = race(setup).runUntilComplete()!;
    const disabled = result.classification.find(entry => entry.ruId === 'ru-iron')!;
    expect(disabled).toMatchObject({ status: 'disabled', reason: 'component_disabled', rank: null });
    expect(disabled.components.find(component => component.id === 'driver-iron')?.health).toBe(0);
    expect(disabled.stats).toMatchObject({ attempts: 0, hits: 0, damageReceived: 0 });
    expect(result.unavailableStatistics).not.toContain('combatHits');
  });
  it('automatically retires active units with zero derived propulsion', () => {
    const setup = circuitFixture(); setup.content.tuningProfiles[0]!.stats.speed.base = 0;
    const engine = race(setup); const output = engine.step();
    expect(output.state.phase).toBe('complete');
    expect(output.state.result?.classification.every(entry => entry.status === 'retired' && entry.reason === 'unable_to_continue')).toBe(true);
    expect(output.events.filter(event => event.type === 'ru_retired')).toHaveLength(4);
  });
  it('rolls back failed movement and exports an explicitly invalid result and last valid state', () => {
    const setup = circuitFixture(); setup.content.tracks[0]!.segments.forEach(segment => { segment.meters = 1e-6; });
    setup.content.tuningProfiles[0]!.movement.maxTransitionsPerTick = 2;
    const engine = race(setup); const before = engine.snapshot(); const output = engine.step();
    expect(output.state.phase).toBe('error'); expect(output.state.tick).toBe(0);
    expect(output.state.ruStates['ru-player']!.tile).toEqual(before.ruStates['ru-player']!.tile);
    expect(output.state.result?.outcome).toBe('simulation_error'); expect(output.state.result?.winnerIds).toEqual([]);
    expect(JSON.parse(engine.exportBundle()).lastValidState.phase).toBe('grid');
    expect(output.events[0]?.type).toBe('invariant_violation');
    expect(() => engine.step()).toThrow();
  });
  it('repeats outcomes/events after input reorder and protects immutable results', () => {
    const setup = circuitFixture(); setup.scenario.rules.laps = 3;
    const a = race(setup); setup.scenario.entries.reverse(); setup.content.drivers.reverse(); const b = race(setup);
    const steps = [a.step(), a.step()]; expect([b.step(), b.step()]).toEqual(steps);
    const result = a.result()!; expect(Reflect.set(result.classification[0]!, 'rank', 99)).toBe(false);
    expect(result.finalStateHash).toBe(stateHash({ ...a.snapshot(), result: null }));
    expect(JSON.parse(a.exportBundle()).state.result).toEqual(result);
  });
  it('anchors crossings to the configured start/finish rather than segment zero', () => {
    const setup = circuitFixture(); setup.content.tracks[0]!.segments[0]!.startFinishBoundary = false;
    setup.content.tracks[0]!.segments[2]!.startFinishBoundary = true;
    for (const tile of Object.values(setup.scenario.startingGrid)) tile.segmentId = 'seg-02';
    setup.scenario.gridRows[0]!.segmentId = 'seg-02';
    expect(race(setup).runUntilComplete()!.classification.every(entry => entry.completedLaps === 1 && entry.normalizedCoursePosition === 4)).toBe(true);
  });
});
it('ties within tolerance without transitively chaining a third finish', () => {
  const ranked = rankFinishes([{ ruId: 'z', finishTimeSeconds: 1 }, { ruId: 'a', finishTimeSeconds: 1.0000005 }, { ruId: 'b', finishTimeSeconds: 1.0000011 }], 1e-6);
  expect(ranked.map(record => record.rank)).toEqual([1, 1, 3]);
  expect(ranked[0]?.tiedWith).toEqual(['a']);
});
it('removes finishers from occupancy while retaining their result and position', () => {
  const setup = circuitFixture();
  const ids = ['ru-player', 'ru-iron'];
  setup.scenario.entries = setup.scenario.entries.filter(entry => ids.includes(entry.id));
  setup.scenario.startingGrid = Object.fromEntries(Object.entries(setup.scenario.startingGrid).filter(([id]) => ids.includes(id)));
  setup.scenario.targetSpeedRatios = { 'ru-player': 1, 'ru-iron': .9 };
  setup.scenario.gridRows[0]!.ruIds = ids;
  setup.content.tracks[0]!.segments.forEach(segment => { segment.lanes[1]!.next.lane = 0; });
  const engine = race(setup);
  const first = engine.step();
  expect(first.state.ruStates['ru-player']!.status).toBe('finished');
  expect(first.state.ruStates['ru-iron']!.status).toBe('active');
  const result = engine.runUntilComplete()!;
  expect(result.classification.every(entry => entry.status === 'finished')).toBe(true);
  expect(engine.snapshot().ruStates['ru-player']!.tile).toEqual(engine.snapshot().ruStates['ru-iron']!.tile);
  assertRaceState(copyJson(engine.snapshot()));
});

function rearFixture() {
  const setup = circuitFixture();
  setup.scenario.startingGrid['ru-player']!.segmentId = 'seg-03';
  setup.scenario.gridRows[0]!.ruIds = setup.scenario.gridRows[0]!.ruIds.filter(id => id !== 'ru-player');
  setup.scenario.gridRows.push({ id: 'rear', segmentId: 'seg-03', ruIds: ['ru-player'] });
  setup.content.tuningProfiles[0]!.stats.speed.base = 2;
  return setup;
}
describe('approved shared-clock rear-row rule', () => {
  it('starts behind the line and awards no lap on the first accepted crossing', () => {
    const engine = race(rearFixture()); const initial = engine.snapshot();
    expect(initial.ruStates['ru-player']).toMatchObject({ initialUnwrappedCoursePosition: -1, normalizedCoursePosition: -1, hasStartedLap: false, firstLapStartedAtSeconds: null, completedLaps: 0 });
    expect(initial.standings.at(-1)?.ruId).toBe('ru-player');
    const output = engine.step();
    expect(output.state.ruStates['ru-player']).toMatchObject({ startLineCrossings: 1, completedLaps: 0, normalizedCoursePosition: 0, hasStartedLap: true, firstLapStartedAtSeconds: 1, status: 'active' });
    expect(output.events.filter(event => event.type === 'lap_started')).toHaveLength(1);
    expect(output.events.some(event => event.type === 'lap_crossed' && event.ruId === 'ru-player')).toBe(false);
    assertRaceState(copyJson(output.state));
  });
  it.each([0, 3])('finishes a full lap after the approach using the common clock with %s countdown ticks', countdown => {
    const setup = rearFixture(); setup.scenario.rules.countdownTicks = countdown;
    const engine = race(setup); const result = engine.runUntilComplete()!;
    const rear = result.classification.find(entry => entry.ruId === 'ru-player')!;
    const front = result.classification.find(entry => entry.ruId === 'ru-iron')!;
    expect(rear).toMatchObject({ status: 'finished', completedLaps: 1, firstLapStartedAtSeconds: 1, finishTimeSeconds: 3, normalizedCoursePosition: 4 });
    expect(rear.stats.startLineCrossings).toBe(2); expect(rear.stats.acceptedTransitions).toBe(5);
    expect(front.firstLapStartedAtSeconds).toBe(0); expect(front.finishTimeSeconds).toBe(2.5);
    expect(result.endTick).toBe(3 + countdown);
  });
  it('retains negative fractional progress before the first line crossing', () => {
    const setup = rearFixture(); setup.content.tracks[0]!.segments[3]!.lanes[0]!.lengthMultiplier = 2;
    const engine = race(setup); const one = engine.step();
    expect(one.state.ruStates['ru-player']).toMatchObject({ normalizedCoursePosition: -.5, progressInSegment: .5, startLineCrossings: 0, hasStartedLap: false });
    const two = engine.step();
    expect(two.events.find(event => event.type === 'lap_started')).toMatchObject({ ruId: 'ru-player', timeSeconds: 1.5 });
    expect(two.state.ruStates['ru-player']!.completedLaps).toBe(0);
  });
  it('does not count an attempted crossing into an occupied start tile', () => {
    const setup = rearFixture(); setup.scenario.startingGrid['ru-iron']!.lane = 0;
    setup.scenario.targetSpeedRatios['ru-iron'] = 0;
    const output = race(setup).step();
    expect(output.events.find(event => event.type === 'movement_blocked' && event.ruId === 'ru-player')).toBeDefined();
    expect(output.events.some(event => event.type === 'lap_started')).toBe(false);
    expect(output.state.ruStates['ru-player']).toMatchObject({ normalizedCoursePosition: -1, hasStartedLap: false, startLineCrossings: 0, completedLaps: 0 });
  });
  it('handles multiple completed laps after the initial crossing, including within one tick', () => {
    const setup = rearFixture(); setup.scenario.rules.laps = 3;
    setup.content.tuningProfiles[0]!.stats.speed.base = 20;
    const engine = race(setup); const one = engine.step();
    expect(one.state.ruStates['ru-player']).toMatchObject({ completedLaps: 2, startLineCrossings: 3, normalizedCoursePosition: 9 });
    const result = engine.runUntilComplete()!;
    const rear = result.classification.find(entry => entry.ruId === 'ru-player')!;
    expect(rear).toMatchObject({ completedLaps: 3, status: 'finished', normalizedCoursePosition: 12 });
    expect(rear.stats.startLineCrossings).toBe(4); expect(rear.stats.acceptedTransitions).toBe(13);
    expect(rear.finishTimeSeconds).toBeCloseTo(1.15);
  });
  it('permits a rear and front entrant to tie on the common clock despite different lap-start times', () => {
    const setup = rearFixture(); setup.content.tuningProfiles[0]!.stats.speed.base = 10;
    setup.scenario.targetSpeedRatios = { 'ru-player': 1, 'ru-iron': .8, 'ru-vulture': 0, 'ru-ash': 0 };
    setup.scenario.rules.finishCutoffTicks = 0;
    const result = race(setup).runUntilComplete()!;
    expect(result.winnerIds).toEqual(['ru-iron', 'ru-player']);
    const rear = result.classification.find(entry => entry.ruId === 'ru-player')!;
    expect(rear).toMatchObject({ firstLapStartedAtSeconds: .2, finishTimeSeconds: 1, rank: 1 });
  });
  it('uses the actual finish boundary and supports rows several segments behind it', () => {
    const setup = rearFixture(); const segments = setup.content.tracks[0]!.segments;
    segments[0]!.startFinishBoundary = false; segments[2]!.startFinishBoundary = true;
    for (const row of setup.scenario.gridRows) {
      row.segmentId = row.id === 'rear' ? 'seg-00' : 'seg-02';
      for (const id of row.ruIds) setup.scenario.startingGrid[id]!.segmentId = row.segmentId;
    }
    const engine = race(setup); expect(engine.snapshot().ruStates['ru-player']!.normalizedCoursePosition).toBe(-2);
    const one = engine.step(); expect(one.state.ruStates['ru-player']!.normalizedCoursePosition).toBe(-1);
    expect(one.state.ruStates['ru-player']!.hasStartedLap).toBe(false);
    const result = engine.runUntilComplete()!;
    expect(result.classification.find(entry => entry.ruId === 'ru-player')).toMatchObject({ completedLaps: 1, status: 'finished', normalizedCoursePosition: 4, firstLapStartedAtSeconds: 1.5 });
  });
  it('runs the six-RU reference deterministically after input reordering', () => {
    const setup = fixture(); const a = race(setup);
    setup.scenario.entries.reverse(); setup.content.beasts.reverse(); setup.scenario.gridRows.reverse();
    const b = race(setup);
    for (let tick = 0; tick < 120; tick++) expect(b.step()).toEqual(a.step());
    expect(b.runUntilComplete()).toEqual(a.runUntilComplete());
    expect(a.snapshot().phase).toBe('complete');
    expect(a.result()!.classification).toHaveLength(6);
    expect(a.result()!.winnerIds.length).toBeGreaterThan(0);
    for (const id of ['ru-bone', 'ru-copper']) {
      const ru = a.snapshot().ruStates[id]!;
      expect(ru.completedLaps).toBe(Math.max(0, ru.startLineCrossings - 1));
      if (ru.status === 'finished') expect(ru.startLineCrossings).toBe(4);
    }
    assertRaceState(copyJson(a.snapshot()));
  });
});
