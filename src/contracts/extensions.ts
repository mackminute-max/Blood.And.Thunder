import type { DeepReadonly, InitialConfiguration, ComponentState } from './initialization.ts';
import type { RaceState, RaceResult } from './race.ts';
import type { MovementEventInput } from './movement.ts';
import type { Hazard } from './environment.ts';
import type { DerivedStats } from './movement.ts';
/** Contracts only: no campaign, alternate format or magic implementation is installed.
 * Future implementations must be pure, return serializable values and use engine RNG state.
 * The core remains the only committer of returned proposals at the named boundary.
 */
export interface ExtensionInput { configuration: DeepReadonly<InitialConfiguration>; state: DeepReadonly<RaceState> }
export interface DeferredExtensions {
  alternativeFormat: { boundary: 'afterMovementBeforeClassification'; input: ExtensionInput; output: { finishedRuIds: string[]; retiredRuIds: string[]; events: MovementEventInput[] } };
  dynamicWeather: { boundary: 'tickStartBeforeDerivation'; input: ExtensionInput; output: { weatherId: string; events: MovementEventInput[] } };
  magic: { boundary: 'combatPhaseBeforeCommit'; input: ExtensionInput & { phase: 'preMove' | 'contact' | 'postMove' }; output: { events: MovementEventInput[] } };
  movingObstacles: { boundary: 'tickStartBeforePerception'; input: ExtensionInput; output: { hazards: Hazard[]; events: MovementEventInput[] } };
  equipment: { boundary: 'derivationBeforeOverrides'; input: ExtensionInput & { ruId: string }; output: Partial<Omit<DerivedStats, 'breakdown'>> };
  campaignRewards: { boundary: 'afterFinalClassification'; input: DeepReadonly<RaceResult>; output: { result: DeepReadonly<RaceResult> } };
  longTermInjuries: { boundary: 'afterFinalClassification'; input: DeepReadonly<RaceResult>; output: { components: DeepReadonly<ComponentState>[] } };
}
/** A read-only result handoff. Economy/recovery must run outside the race engine. */
export function campaignHandoff(result: DeepReadonly<RaceResult>): DeferredExtensions['campaignRewards']['output'] {
  return { result };
}
