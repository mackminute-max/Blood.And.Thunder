import type { Hazard, EnvironmentState, EnvironmentStats } from './environment.ts';
import type { CombatDecision, CombatStats } from './combat.ts';
import type { SignId } from '../configuration/commands.ts';
import type { AiMemory, AiDecision } from './ai.ts';
import type { InitialRaceState, InitialRUState, DeepReadonly } from './initialization.ts';
import type { TileRef } from '../configuration/schemas.ts';
export interface DerivedStats {
  maxSpeedMps: number; accelMps2: number; brakeMps2: number; handling: number; stability: number; endurance: number;
  breakdown: Record<string, number>;
}
export type MovementRU = Omit<InitialRUState, 'speedMps' | 'targetSpeedMps' | 'progressInSegment' | 'blockedTicks' | 'status' | 'statusReason' | 'completedLaps' | 'activeSignId' | 'teamFatigue'> & {
  disabledAtMovementTick: number | null; wreckRemoved: boolean; environmentStats: EnvironmentStats;
  combatDecision: CombatDecision | null; actionCooldowns: Record<string, number>; combatStats: CombatStats;
  activeSignId: SignId | null; teamFatigue: number; derivedOverrides: { maxSpeedMps?: number }; aiMemory: AiMemory; aiDecision: AiDecision | null;
  status: 'active' | 'disabled' | 'finished' | 'retired' | 'disqualified' | 'dnf'; statusReason?: string; completedLaps: number;
  speedMps: number; targetSpeedMps: number; progressInSegment: number; blockedTicks: number; derived: DerivedStats;
};
export type MovementState = Omit<InitialRaceState, 'tick' | 'phase' | 'ruStates' | 'commandCursor' | 'hazards'> & {
  hazards: Hazard[]; environment: EnvironmentState; commandCursor: number; tick: number; phase: 'grid' | 'running' | 'halted' | 'error'; haltReason?: 'tick_limit' | 'invariant_violation'; ruStates: Record<string, MovementRU>;
};
export type MovementEvent = {
  id: string; tick: number; substep: number; ruId: string; fraction: number;
} & (
  { type: 'movement_sample'; progress: number }
  | { type: 'fatigue_changed'; details: Record<string, unknown> }
  | { type: 'hazard_activated'; details: Record<string, unknown> }
  | { type: 'hazard_expired'; details: Record<string, unknown> }
  | { type: 'hazard_moved'; details: Record<string, unknown> }
  | { type: 'hazard_skipped'; details: Record<string, unknown> }
  | { type: 'wreck_removed'; details: Record<string, unknown> }
  | { type: 'collision_avoided'; details: Record<string, unknown> }
  | { type: 'collision_damage'; details: Record<string, unknown> }
  | { type: 'ai_intent'; decision: AiDecision }
  | { type: 'attack_attempt'; details: Record<string, unknown> }
  | { type: 'attack_rejected'; details: Record<string, unknown> }
  | { type: 'attack_hit'; details: Record<string, unknown> }
  | { type: 'attack_miss'; details: Record<string, unknown> }
  | { type: 'defense_used'; details: Record<string, unknown> }
  | { type: 'component_damaged'; details: Record<string, unknown> }
  | { type: 'component_disabled'; details: Record<string, unknown> }
  | { type: 'ru_disabled'; details: Record<string, unknown> }
  | { type: 'ram_attempt'; details: Record<string, unknown> }
  | { type: 'contact'; details: Record<string, unknown> }
  | { type: 'combat_intent'; details: Record<string, unknown> }
  | { type: 'ai_outcome'; details: Record<string, unknown> }
  | { type: 'command_accepted'; details: Record<string, unknown> }
  | { type: 'command_rejected'; details: Record<string, unknown> }
  | { type: 'sign_queued'; details: Record<string, unknown> }
  | { type: 'sign_activated'; details: Record<string, unknown> }
  | { type: 'sign_cancelled'; details: Record<string, unknown> }
  | { type: 'sign_raised'; details: Record<string, unknown> }
  | { type: 'sign_lowered'; details: Record<string, unknown> }
  | { type: 'developer_override'; details: Record<string, unknown> }
  | { type: 'movement_transition'; from: TileRef; to: TileRef; crossedStartLine: boolean }
  | { type: 'lane_change_attempt'; from: TileRef; to: TileRef }
  | { type: 'lane_change_resolved'; from: TileRef; to: TileRef; accepted: boolean; reason: string; speedBefore: number; speedAfter: number; probability: number | null; roll: number | null }
  | { type: 'handling_check'; context: 'corner_entry'; accepted: boolean; probability: number; roll: number | null; safeSpeed: number; speedBefore: number; speedAfter: number }
  | { type: 'movement_recovery'; reason: 'deadlock'; blockedTicks: number }
  | { type: 'movement_blocked'; from: TileRef; to: TileRef; discardedMeters: number; reason: 'occupied' | 'contested' | 'reciprocal' | 'hazard'; outcome: 'yield' | 'brake' }
);
export interface MovementDiagnostic {
  tick: number; substep: number; level: 'info' | 'trace' | 'warning' | 'error'; subsystem: 'stats' | 'movement' | 'invariants' | 'rules' | 'ai' | 'commands' | 'combat' | 'environment';
  ruId?: string; message: string; details: Record<string, unknown>;
}
export interface InvariantEvent { id: string; tick: number; substep: number; type: 'invariant_violation'; message: string }
export interface TickOutput {
  state: DeepReadonly<MovementState>; events: readonly DeepReadonly<MovementEvent | InvariantEvent | import('./initialization.ts').InitializationEvent>[];
  diagnostics: readonly DeepReadonly<MovementDiagnostic>[]; stateHash: string;
}
export type MovementEventInput = { [K in MovementEvent['type']]: Omit<Extract<MovementEvent, { type: K }>, 'id' | 'tick' | 'substep'> }[MovementEvent['type']];
