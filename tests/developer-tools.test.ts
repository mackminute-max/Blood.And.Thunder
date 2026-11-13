import { expect, it } from 'vitest';
import { createRecording, filterLogs } from '../src/diagnostics/recording.ts';
import { exportConfiguration, importConfiguration, validateSavedConfiguration } from '../src/persistence/configuration.ts';
import { fieldMetadata } from '../src/configuration/field-metadata.ts';
import { fixture } from './setup-fixture.ts';
it('round-trips a validated portable configuration without rewriting caller data', () => {
  const setup = fixture(); const before = JSON.stringify(setup);
  const draft = { kind: 'blood-thunder-configuration-a4-1', name: '  Regression  ', mode: 'race', ...setup };
  const encoded = exportConfiguration(draft); const restored = importConfiguration(encoded);
  expect(restored.name).toBe('Regression'); expect(restored.scenario.seed).toBe(setup.scenario.seed);
  expect(importConfiguration(exportConfiguration(restored))).toEqual(restored);
  expect(JSON.stringify(setup)).toBe(before);
});
it('rejects malformed configuration files and invalid references/versions', () => {
  const setup = fixture(); const valid = { kind: 'blood-thunder-configuration-a4-1', name: 'Test', mode: 'race', ...setup };
  expect(() => importConfiguration('{broken}')).toThrow();
  expect(() => validateSavedConfiguration({ ...valid, kind: 'unknown' })).toThrow();
  expect(() => validateSavedConfiguration({ ...valid, scenario: { ...valid.scenario, simulationVersion: 'old' } })).toThrow();
  expect(() => validateSavedConfiguration({ ...valid, scenario: { ...valid.scenario, trackId: 'missing' } })).toThrow('scenario.trackId');
  expect(() => validateSavedConfiguration({ ...valid, name: ' ' })).toThrow();
});
it('bounds snapshots and log records with explicit loss counts and independent capture IDs', () => {
  const recording = createRecording(2, 3);
  for (let i = 0; i < 3; i++) recording.append({ state: { tick: i < 2 ? 0 : 1, phase: 'running' }, events: [{ tick: i, type: 'movement_transition', ruId: 'ru-player' }], diagnostics: [{ tick: i, level: 'trace', subsystem: 'movement', message: 'Budget' }] });
  expect(recording.summary()).toMatchObject({ droppedFrames: 1, droppedRecords: 3, retainedFrames: 2, retainedRecords: 3 });
  expect(recording.frames().map(frame => frame.captureId)).toEqual([1, 2]);
  expect(recording.rows().map(row => row.index)).toEqual([3, 4, 5]);
});
it('records owned immutable state and supports combined timeline filters', () => {
  const recording = createRecording();
  const frame = { state: { tick: 3, phase: 'running' }, events: [{ tick: 3, substep: 2, type: 'movement_blocked', ruId: 'ru-player', discardedMeters: 12 }], diagnostics: [{ tick: 3, level: 'error', subsystem: 'invariants', message: 'Failed' }] };
  recording.append(frame); frame.state.tick = 9;
  expect((recording.frames()[0]!.state as { tick: number }).tick).toBe(3);
  expect(Reflect.set(recording.rows()[0]!, 'tick', 8)).toBe(false);
  expect(filterLogs(recording.rows(), { minTick: 3, maxTick: 3, ruId: 'ru-player', subsystem: 'movement', level: 'info', type: 'movement_blocked', search: 'DISCARDED' })).toHaveLength(1);
  expect(filterLogs(recording.rows(), { level: 'error', search: 'Failed' })).toHaveLength(1);
  expect(filterLogs(recording.rows(), { minTick: 4 })).toHaveLength(0);
  recording.append({ state: { tick: 3 }, events: [{ type: 'race_initialized', actorIds: ['ru-iron'] }], diagnostics: [] });
  expect(filterLogs(recording.rows(), { ruId: 'ru-iron' })).toHaveLength(1);
});
it('rejects invalid history limits and nonfinite tick values', () => {
  expect(() => createRecording(0)).toThrow(); expect(() => createRecording(2, Infinity)).toThrow();
  expect(() => createRecording().append({ state: { tick: NaN }, events: [], diagnostics: [] })).toThrow();
});
it('derives editor bounds from schemas rather than duplicating validation constants', () => {
  expect(fieldMetadata(['beasts', '0', 'speed'])).toMatchObject({ min: 0, max: 100 });
  expect(fieldMetadata(['chariots', '0', 'weightKg'])).toMatchObject({ exclusiveMin: 0 });
  expect(fieldMetadata(['$scenario', 'rules', 'laps'])).toMatchObject({ exclusiveMin: 0, integer: true });
});

it('includes explicit combat and contact targets in RU filters without matching unrelated payload strings', () => {
  const recording = createRecording();
  recording.append({ state: { tick: 1 }, diagnostics: [], events: [
    { type: 'attack_hit', ruId: 'ru-player', details: { ruId: 'ru-player', targetRuId: 'ru-iron' } },
    { type: 'contact', ruId: 'ru-player', details: { actorId: 'ru-player', targetId: 'ru-iron' } },
    { type: 'defense_used', ruId: 'ru-iron', details: { against: 'ru-player' } },
    { type: 'command_rejected', ruId: 'ru-player', details: { reason: 'ru-iron' } },
  ] });
  expect(filterLogs(recording.rows(), { ruId: 'ru-iron' }).map(row => row.type)).toEqual(['attack_hit', 'contact', 'defense_used']);
  expect(filterLogs(recording.rows(), { ruId: 'ru-player', type: 'defense_used' })).toHaveLength(1);
});
