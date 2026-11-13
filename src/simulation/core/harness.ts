import type { HarnessInput, HarnessState } from '../../contracts/harness.ts';

function validate(input: unknown): asserts input is HarnessInput {
  if (typeof input !== 'object' || input === null ||
      !('schemaVersion' in input) || input.schemaVersion !== 'harness-1' ||
      !('seed' in input) || typeof input.seed !== 'string' || input.seed.trim() === '' ||
      Object.keys(input).some(key => !['schemaVersion', 'seed'].includes(key))) {
    throw new Error('Expected harness-1 configuration with a nonempty seed');
  }
}

/** Initialization only: deliberately contains no racing mechanics or random draws. */
export function initializeHarness(input: unknown): { snapshot(): HarnessState } {
  validate(input);
  const state: HarnessState = Object.freeze({ phase: 'initialized', tick: 0, seed: input.seed });
  return { snapshot: () => Object.freeze({ ...state }) };
}

/** Gate 0 execution boundary, not a completed race runner. */
export function runRace(input: unknown): HarnessState {
  return initializeHarness(input).snapshot();
}
