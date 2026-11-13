import type { TickOutput } from '../../contracts/movement.ts';
import type { RaceTickOutput } from '../../contracts/race.ts';
import { createMovementEngine } from './movement-engine.ts';
import { createRaceEngine } from './race-engine.ts';
import type { CommandJournalEntry } from '../../contracts/ai.ts';
/** Re-executes inputs; this does not restore or trust serialized mutable state. */
interface ReplayInput { initialConfiguration: { scenario: unknown; content: unknown }; commandJournal: readonly CommandJournalEntry[]; state: { tick: number; phase: string } }
interface ReplayEngine { initialConfiguration: { readonly scenario: { readonly rules: { readonly maxTicks: number; readonly countdownTicks: number; readonly maxCommandSubmissions: number } } }; snapshot(): { readonly tick: number; readonly phase: string }; submit(input: unknown, context: { paused: boolean }): unknown; step(): TickOutput | RaceTickOutput; latest(): TickOutput | RaceTickOutput }
function executeReplay<T extends ReplayEngine>(engine: T, input: ReplayInput, observe?: (output: TickOutput | RaceTickOutput) => void): T {
  observe?.(engine.latest());
  if (!Number.isSafeInteger(input.state.tick) || input.state.tick < 0 || input.state.tick > engine.initialConfiguration.scenario.rules.maxTicks + engine.initialConfiguration.scenario.rules.countdownTicks) throw new Error('Invalid replay end tick');
  const live = input.commandJournal.filter(entry => entry.origin === 'live');
  if (live.length > engine.initialConfiguration.scenario.rules.maxCommandSubmissions || live.some((entry, i) => !Number.isSafeInteger(entry.submittedAtTick) || entry.submittedAtTick < 0 || entry.submittedAtTick > input.state.tick || i > 0 && entry.submittedAtTick < live[i - 1]!.submittedAtTick)) throw new Error('Invalid replay journal ordering/limits');
  let cursor = 0;
  const enqueue = () => { while (cursor < live.length && live[cursor]!.submittedAtTick === engine.snapshot().tick && live[cursor]!.submittedAtPhase === engine.snapshot().phase) { const entry = live[cursor++]!; engine.submit(entry.input, { paused: entry.paused }); } };
  while (engine.snapshot().tick < input.state.tick && !['complete', 'error', 'halted'].includes(engine.snapshot().phase)) { enqueue(); engine.step(); observe?.(engine.latest()); }
  enqueue();
  if (input.state.phase === 'error' && !['error', 'complete'].includes(engine.snapshot().phase)) { engine.step(); observe?.(engine.latest()); }
  enqueue();
  return engine;
}

export const replayRace = (input: ReplayInput, observe?: (output: TickOutput | RaceTickOutput) => void) => executeReplay(createRaceEngine(input.initialConfiguration.scenario, input.initialConfiguration.content), input, observe);
export const replayMovement = (input: ReplayInput, observe?: (output: TickOutput | RaceTickOutput) => void) => executeReplay(createMovementEngine(input.initialConfiguration.scenario, input.initialConfiguration.content), input, observe);
