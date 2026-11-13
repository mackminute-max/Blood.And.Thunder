import { expect, it } from 'vitest';
import { fixture } from './setup-fixture.ts';
import { createRaceEngine } from '../src/simulation/core/race-engine.ts';
import { copyJson } from '../src/shared/immutable.ts';
import { tilePoint, visualPath, samplePath } from '../src/presentation/phaser/geometry.ts';
import { selectedDetail, standings, positionChanges } from '../src/presentation/race/model.ts';
import type { ViewFrame, PresentationEvent } from '../src/presentation/race/model.ts';
import { createCommentary } from '../src/presentation/commentary/generator.ts';
import { COMMENTARY } from '../src/presentation/commentary/settings.ts';
function harness() { const f = fixture(); const engine = createRaceEngine(f.scenario, f.content); return { engine, config: engine.initialConfiguration, frame: engine.latest() }; }
it('maps every tile and fractional segment to finite schematic positions with correct wrap/topology', () => {
  const { config } = harness(); const track = config.content.tracks[0]!;
  for (const segment of track.segments) for (const lane of segment.lanes) {
    const end = tilePoint(track, { segmentId: segment.id, lane: lane.index }, 1); const next = tilePoint(track, lane.next);
    expect(end.x).toBeCloseTo(next.x); expect(end.y).toBeCloseTo(next.y);
    const midpoint = tilePoint(track, { segmentId: segment.id, lane: lane.index }, .5); expect(Number.isFinite(midpoint.x + midpoint.y)).toBe(true);
  }
  expect(tilePoint(track, { segmentId: 'seg-00', lane: 0 })).not.toEqual(tilePoint(track, { segmentId: 'seg-00', lane: 1 }));
});
it('interpolates accepted intermediate transitions instead of jumping directly across the track', () => {
  const { config, frame } = harness(); const next = copyJson(frame); next.state.tick = 1;
  next.state.ruStates['ru-player']!.tile.segmentId = 'seg-02';
  next.events = [{ id: '1:1:0', tick: 1, substep: 1, type: 'movement_transition', ruId: 'ru-player', fraction: .4, from: { segmentId: 'seg-00', lane: 0 }, to: { segmentId: 'seg-01', lane: 0 }, crossedStartLine: false }, { id: '1:2:0', tick: 1, substep: 2, type: 'movement_transition', ruId: 'ru-player', fraction: .8, from: { segmentId: 'seg-01', lane: 0 }, to: { segmentId: 'seg-02', lane: 0 }, crossedStartLine: false }];
  const path = visualPath(config.content.tracks[0]!, 'ru-player', frame, next);
  expect(path).toHaveLength(4); expect(samplePath(path, .4)).toEqual(tilePoint(config.content.tracks[0]!, { segmentId: 'seg-01', lane: 0 })); expect(samplePath(path, 1)).toEqual(tilePoint(config.content.tracks[0]!, { segmentId: 'seg-02', lane: 0 }));
  const hash = frame.stateHash; samplePath(path, .5); expect(frame.stateHash).toBe(hash); expect(frame.state.ruStates['ru-player']!.tile.segmentId).toBe('seg-00');
});
it('snaps initialization, restart and missing-frame gaps to the current authoritative position', () => {
  const { config, frame } = harness(); const next = copyJson(frame); next.state.tick = 4; next.state.ruStates['ru-player']!.tile.segmentId = 'seg-04';
  const path = visualPath(config.content.tracks[0]!, 'ru-player', frame, next); expect(samplePath(path, 0)).toEqual(samplePath(path, 1));
});
it('shows own condition/readiness but never opponent hidden intentions or component stats', () => {
  const { config, frame } = harness(); const own = selectedDetail(config, frame.state, 'ru-player'); expect(own.visibility).toBe('own'); expect(own.components).toHaveLength(4);
  const other = selectedDetail(config, frame.state, 'ru-iron'); expect(other.visibility).toBe('perceived'); expect(JSON.stringify(other)).not.toMatch(/cooldowns|aiDecision|components|personality|combatDecision/);
  const unseen = copyJson(frame.state); unseen.ruStates['ru-iron']!.tile.segmentId = 'seg-20'; expect(selectedDetail(config, unseen, 'ru-iron')).toEqual({ visibility: 'outside player perception' });
});
it('computes normalized-course gaps without inventing seconds or breaking official ties', () => {
  const { config, frame } = harness(); const rows = standings(config, frame.state); expect(rows.find(r => r.ruId === 'ru-bone')!.gapNcu).toBe(1); expect(rows.find(r => r.ruId === 'ru-player')!.progress).toBe(0);
  const state = copyJson(frame.state); state.standings.slice(0, 2).forEach(row => { row.rank = 1; row.status = 'finished'; }); expect(standings(config, state).slice(0, 2).map(row => row.officialRank)).toEqual([1, 1]);
});
it('derives position calls only from strict progress reversal, active racers and transition evidence', () => {
  const { frame } = harness(); const before = copyJson(frame); before.state.ruStates['ru-player']!.normalizedCoursePosition = -1;
  const after = copyJson(frame); after.state.tick = 1; after.state.ruStates['ru-player']!.normalizedCoursePosition = 1;
  expect(positionChanges(before, after)).toEqual([]);
  after.events = [{ id: '1:1:0', tick: 1, substep: 1, type: 'movement_transition', ruId: 'ru-player', fraction: .5, from: { segmentId: 'seg-00', lane: 0 }, to: { segmentId: 'seg-01', lane: 0 }, crossedStartLine: false }];
  const changes = positionChanges(before, after); expect(changes.some(c => c.passedRuId === 'ru-iron' && c.lead)).toBe(true); expect(changes[0]!.evidence).toContain('1:1:0');
  after.state.ruStates['ru-iron']!.status = 'disabled'; expect(positionChanges(before, after).some(c => c.passedRuId === 'ru-iron')).toBe(false);
  after.state.ruStates['ru-player']!.normalizedCoursePosition = 0; expect(positionChanges(before, after)).toEqual([]);
});
it('combines actual hit outcomes with attempts and never turns a miss/rejection into a hit', () => {
  const { config } = harness(); const radio = createCommentary(config);
  const events: PresentationEvent[] = [
    { id: '1:a', tick: 1, substep: 0, type: 'attack_attempt', ruId: 'ru-player', fraction: 0, details: { attackId: 'attack1', targetRuId: 'ru-iron' } },
    { id: '1:b', tick: 1, substep: 0, type: 'attack_hit', ruId: 'ru-player', fraction: 0, details: { attackId: 'attack1', targetRuId: 'ru-iron', amount: 18, componentKind: 'chariot', channel: 'driver' } },
  ];
  radio.append(1, events); expect(radio.feed()).toHaveLength(1); expect(radio.feed()[0]!.text).toMatch(/lands a hit/); expect(radio.feed()[0]!.sourceIds).toEqual(['1:b']);
  radio.append(2, [{ id: '2:a', tick: 2, substep: 0, type: 'attack_miss', ruId: 'ru-player', fraction: 0, details: { targetRuId: 'ru-iron' } }]); expect(radio.feed().at(-1)!.text).toMatch(/misses/);
});
it('reports an attempt or canceled intent explicitly without asserting an outcome', () => {
  const { config } = harness(); const radio = createCommentary(config);
  radio.append(1, [{ id: 'a', tick: 1, substep: 0, type: 'ram_attempt', ruId: 'ru-player', fraction: 0, details: { targetRuId: 'ru-iron' } }, { id: 'b', tick: 1, substep: 0, type: 'attack_rejected', ruId: 'ru-player', fraction: 1, details: { reason: 'out_of_range' } }]);
  expect(radio.feed().map(c => c.text).join(' ')).toMatch(/attempts/); expect(radio.feed().map(c => c.text).join(' ')).toMatch(/cannot proceed/); expect(radio.feed().map(c => c.text).join(' ')).not.toMatch(/lands|destroyed|killed/);
});
it('announces death/destruction only from a confirmed component-disabled flag', () => {
  const { config } = harness(); const radio = createCommentary(config);
  radio.append(1, [{ id: 'a', tick: 1, substep: 0, type: 'component_disabled', ruId: 'ru-player', fraction: 1, details: { componentKind: 'driver', dead: false } }]); expect(radio.feed()[0]!.text).not.toMatch(/fatality/);
  radio.append(2, [{ id: 'b', tick: 2, substep: 0, type: 'component_disabled', ruId: 'ru-iron', fraction: 1, details: { componentKind: 'driver', dead: true } }]); expect(radio.feed().at(-1)!.text).toMatch(/fatality is confirmed/);
});
it('keeps critical finishes/classification while suppressing redundant lap calls and routine chatter', () => {
  const { config } = harness(); const radio = createCommentary(config, { ...COMMENTARY, maxRoutinePerTick: 0 });
  radio.append(1, [{ id: 'a', tick: 1, substep: 1, type: 'lap_crossed', ruId: 'ru-player', timeSeconds: .1, details: { completedLaps: 3, fraction: .5 } }, { id: 'b', tick: 1, substep: 1, type: 'ru_finished', ruId: 'ru-player', timeSeconds: .1, details: { fraction: .5 } }, { id: 'c', tick: 1, substep: 2, type: 'race_finished', ruId: null, timeSeconds: .2, details: { winnerIds: ['ru-player'] } }]);
  expect(radio.feed().map(c => c.type)).toEqual(['ru_finished', 'race_finished']); expect(radio.highlights()).toHaveLength(2); expect(radio.feed()[1]!.text).toMatch(/Player takes the victory/);
});
it('preserves tie winners and no-finisher classification without fabricating a victory', () => {
  const { config } = harness(); const radio = createCommentary(config); radio.append(1, [{ id: 'a', tick: 1, substep: 1, type: 'race_finished', ruId: null, timeSeconds: 1, details: { winnerIds: ['ru-player', 'ru-iron'] } }]); expect(radio.feed()[0]!.text).toMatch(/share the victory/);
  const empty = createCommentary(config); empty.append(1, [{ id: 'a', tick: 1, substep: 1, type: 'race_finished', ruId: null, timeSeconds: 1, details: { winnerIds: [] } }]); expect(empty.feed()[0]!.text).toMatch(/no eligible finisher/);
});
it('suppresses repetitive routine calls, handles paused duplicates and bounds feed/highlights', () => {
  const { config } = harness(); const radio = createCommentary(config, { ...COMMENTARY, maxFeed: 3, maxHighlights: 2 });
  for (let tick = 1; tick <= 10; tick++) radio.append(tick, [{ id: `a${tick}`, tick, substep: 0, type: 'sign_lowered', ruId: 'ru-player', fraction: 0, details: {} }, { id: `b${tick}`, tick, substep: 1, type: 'ru_disabled', ruId: 'ru-iron', fraction: 1, details: {} }]);
  expect(radio.feed()).toHaveLength(3); expect(radio.highlights()).toHaveLength(2); expect(radio.summary().suppressed).toBe(9);
  const feed = radio.feed(); radio.append(10, []); expect(radio.feed()).toEqual(feed); feed[0]!.sourceIds.push('mutated'); expect(radio.feed()[0]!.sourceIds).not.toContain('mutated');
});
it('ignores diagnostics, hidden AI intentions and routine fatigue; signs do not guarantee action', () => {
  const { config } = harness(); const radio = createCommentary(config); radio.append(1, [{ id: 'a', tick: 1, substep: 0, type: 'sign_raised', ruId: 'ru-player', fraction: 0, details: { newValue: 'attack' } }, { id: 'b', tick: 1, substep: 0, type: 'fatigue_changed', ruId: 'ru-player', fraction: 1, details: {} }]); expect(radio.feed()).toHaveLength(1); expect(radio.feed()[0]!.text).toMatch(/attack sign is active; the driver still chooses/);
});
it('consumes real race event streams deterministically without changing engine snapshots or results', () => {
  const f = fixture(); f.scenario.rules.maxTicks = 4; const a = createRaceEngine(f.scenario, f.content); const b = createRaceEngine(f.scenario, f.content); const radio = createCommentary(a.initialConfiguration); const repeat = createCommentary(a.initialConfiguration);
  let previous: ViewFrame | null = null;
  while (a.snapshot().phase !== 'complete') { const frame = a.step(); const changes = positionChanges(previous, frame); radio.append(frame.state.tick, frame.events, changes); repeat.append(frame.state.tick, frame.events, changes); selectedDetail(a.initialConfiguration, frame.state, 'ru-iron'); standings(a.initialConfiguration, frame.state); for (const id of Object.keys(frame.state.ruStates)) samplePath(visualPath(a.initialConfiguration.content.tracks[0]!, id, previous, frame), .5); previous = frame; b.step(); expect(a.latest()).toEqual(b.latest()); }
  expect(radio.feed()).toEqual(repeat.feed()); expect(a.result()).toEqual(b.result()); expect(radio.feed().every(call => call.sourceIds.length > 0)).toBe(true);
});
