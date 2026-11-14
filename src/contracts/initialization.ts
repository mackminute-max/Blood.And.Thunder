import type { ContentRegistry, RaceScenario, TileRef } from '../configuration/schemas.ts';
import type { RngStreams, RNG_VERSION } from './rng.ts';
export type DeepReadonly<T> = T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;
export interface ComponentState { kind: 'driver' | 'chariot' | 'beast'; dead: boolean; id: string; health: number; maxHealth: number; band: 'functional' | 'damaged' | 'critical' | 'disabled'; injuries: string[]; destroyed: boolean }
export interface InitialRUState {
  id: string; tile: TileRef; progressInSegment: 0; completedLaps: 0;
  speedMps: 0; targetSpeedMps: 0; teamFatigue: 0; blockedTicks: 0;
  status: 'active' | 'disabled'; statusReason?: 'component_disabled';
  pendingSign: { signId: import('../configuration/commands.ts').SignId; queuedAtTick: number; commandId: string; source: 'player' | 'developer' } | null;
  signUsage: { queued: number; activated: number; replacements: number; lowered: number; cancelled: number };
  activeSignId: null; signOpportunitiesRemaining: number;
  driver: ComponentState; chariot: ComponentState; beasts: ComponentState[];
  cooldowns: Record<string, number>;
}
export interface InitialRaceState {
  schemaVersion: RaceScenario['schemaVersion']; simulationVersion: RaceScenario['simulationVersion'];
  tick: 0; phase: 'grid'; scenarioId: string; seed: string; rngVersion: typeof RNG_VERSION;
  rngStates: RngStreams; ruStates: Record<string, InitialRUState>;
  hazards: never[]; finishRecords: never[]; commandCursor: 0;
  activeWeatherId: string;
}
export interface InitializationEvent { id: '0:0:0'; tick: 0; substep: 0; type: 'race_initialized'; actorIds: string[]; scenarioId: string }
export interface InitializationDiagnostic { tick: 0; substep: 0; level: 'info'; subsystem: 'initialization'; message: string; ruId?: string }
export interface InitialConfiguration { scenario: RaceScenario; content: ContentRegistry }
