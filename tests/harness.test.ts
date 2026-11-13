import { describe, expect, it } from 'vitest';
import { initializeHarness, runRace } from '../src/simulation/core/harness.ts';
const input = { schemaVersion: 'harness-1', seed: 'test' };
describe('Gate 0 headless boundary', () => {
  it('runs with no browser globals and repeats initialization', () => {
    expect(typeof window).toBe('undefined');
    expect(runRace(input)).toEqual(runRace(input));
    expect(runRace(input)).toEqual({ phase: 'initialized', tick: 0, seed: 'test' });
  });
  it('does not retain caller-owned input or expose mutable state', () => {
    const config = { ...input };
    const engine = initializeHarness(config);
    config.seed = 'changed';
    const snapshot = engine.snapshot();
    expect(() => Object.assign(snapshot, { seed: 'mutated' })).toThrow();
    expect(engine.snapshot().seed).toBe('test');
  });
  it.each([null, {}, { ...input, seed: '' }, { ...input, schemaVersion: 'unknown' }, { ...input, extra: true }])('rejects invalid input %j', value => {
    expect(() => runRace(value)).toThrow();
  });
});
