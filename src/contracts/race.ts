import type { MovementRU, MovementState, MovementEvent, MovementDiagnostic, InvariantEvent } from './movement.ts';
import type { DeepReadonly, ComponentState } from './initialization.ts';
export interface RaceRU extends MovementRU {
  raceStats: import('../simulation/rules/statistics.ts').RaceStatistics;
  initialUnwrappedCoursePosition: number; hasStartedLap: boolean; firstLapStartedAtSeconds: number | null;
  startLineCrossings: number; normalizedCoursePosition: number; acceptedTransitions: number;
  blockedTransitions: number; finishTimeSeconds: number | null;
}
export interface FinishRecord { ruId: string; finishTimeSeconds: number; rank: number; tiedWith: string[] }
export interface Standing { ruId: string; status: MovementRU['status']; normalizedCoursePosition: number; rank: number | null }
export interface RaceClassification {
  ruId: string; status: MovementRU['status']; reason: string | null; rank: number | null;
  finishTimeSeconds: number | null; firstLapStartedAtSeconds: number | null; completedLaps: number; normalizedCoursePosition: number;
  components: ComponentState[]; stats: import('./combat.ts').CombatStats & import('./environment.ts').EnvironmentStats & { averageFatigue: number } & import('../simulation/rules/statistics.ts').RaceStatistics & { acceptedTransitions: number; blockedTransitions: number; startLineCrossings: number; signsUsed: number; signUsage: import('./initialization.ts').InitialRUState['signUsage']; activeSignId: import('../configuration/commands.ts').SignId | null; pendingSign: import('./initialization.ts').InitialRUState['pendingSign'] };
}
export interface RaceResult {
  competitionStyle: 'combat' | 'pure'; schemaVersion: string; simulationVersion: string; scenarioId: string; seed: string;
  outcome: 'classified' | 'simulation_error'; finalStateHash: string; endTick: number; elapsedRaceSeconds: number;
  winnerIds: string[]; classification: RaceClassification[];
  environment: { activatedEvents: number; skippedEvents: number; scheduledExternalEvents: number };
  unavailableStatistics: string[];
}
export type RaceState = Omit<MovementState, 'phase' | 'finishRecords' | 'ruStates' | 'haltReason'> & {
  phase: 'grid' | 'countdown' | 'running' | 'concluding' | 'complete' | 'error';
  ruStates: Record<string, RaceRU>; countdownRemaining: number; raceStartedTick: number | null;
  elapsedRaceTicks: number; finishRecords: FinishRecord[]; firstFinisherRaceTick: number | null;
  progressOrder: Record<string, number>; standings: Standing[]; result: RaceResult | null;
};
export interface RaceRuleEvent {
  id: string; tick: number; substep: number;
  type: 'ru_overtake' | 'race_started' | 'race_countdown' | 'lap_started' | 'lap_crossed' | 'ru_finished' | 'ru_retired' | 'ru_dnf' | 'race_finished';
  ruId: string | null; timeSeconds: number; details: Record<string, unknown>;
}
export type RaceEvent = MovementEvent | InvariantEvent | RaceRuleEvent;
export interface RaceTickOutput {
  state: DeepReadonly<RaceState>; events: readonly DeepReadonly<RaceEvent>[];
  diagnostics: readonly DeepReadonly<MovementDiagnostic>[]; stateHash: string;
}
