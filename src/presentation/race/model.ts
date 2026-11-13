import type { DeepReadonly, InitialConfiguration, InitializationEvent } from '../../contracts/initialization.ts';
import type { MovementState } from '../../contracts/movement.ts';
import type { RaceState, RaceEvent } from '../../contracts/race.ts';
import { perceive } from '../../simulation/ai/driver.ts';
export type ViewState = DeepReadonly<MovementState | RaceState>;
export type PresentationEvent = RaceEvent | InitializationEvent;
export interface ViewFrame { state: ViewState; events: readonly DeepReadonly<PresentationEvent>[]; stateHash: string; diagnostics: readonly unknown[] }
export interface PositionChange { id: string; tick: number; ruId: string; passedRuId: string; lead: boolean; evidence: string[] }
/** Strict progress reversal among still-active racers; ties/status changes are not passes. */
export function positionChanges(previous: ViewFrame | null, frame: ViewFrame): PositionChange[] {
  if (!previous || !('standings' in previous.state) || !('standings' in frame.state) || frame.state.tick !== previous.state.tick + 1) return [];
  const before = previous.state; const now = frame.state;
  const active = Object.values(now.ruStates).filter(ru => ru.status === 'active' && before.ruStates[ru.id]?.status === 'active');
  const leaders = active.filter(ru => !active.some(other => other.normalizedCoursePosition > ru.normalizedCoursePosition));
  const changes: PositionChange[] = [];
  for (const ru of active) for (const passed of active) if (ru.id !== passed.id && before.ruStates[ru.id]!.normalizedCoursePosition < before.ruStates[passed.id]!.normalizedCoursePosition && ru.normalizedCoursePosition > passed.normalizedCoursePosition) {
    const evidence = frame.events.filter(event => event.type === 'movement_transition' && (event.ruId === ru.id || event.ruId === passed.id)).map(event => event.id);
    if (!evidence.length) continue;
    changes.push({ id: `position:${frame.state.tick}:${ru.id}:${passed.id}`, tick: frame.state.tick, ruId: ru.id, passedRuId: passed.id, lead: leaders.length === 1 && leaders[0]!.id === ru.id && !now.finishRecords.length, evidence: [previous.stateHash, frame.stateHash, ...evidence] });
  }
  return changes.sort((a, b) => a.ruId < b.ruId ? -1 : a.ruId > b.ruId ? 1 : a.passedRuId < b.passedRuId ? -1 : 1);
}
export function standings(config: DeepReadonly<InitialConfiguration>, state: ViewState) {
  if (!('standings' in state)) return [];
  const competing = state.standings.filter(s => s.status === 'active' || s.status === 'finished');
  const activeLead = competing.length ? Math.max(...competing.map(s => s.normalizedCoursePosition)) : 0;
  const boundaryCount = config.content.tracks.find(t => t.id === config.scenario.trackId)!.segments.length;
  return state.standings.map((standing, index) => {
    const ru = state.ruStates[standing.ruId]!;
    return { ruId: ru.id, name: config.scenario.entries.find(e => e.id === ru.id)!.name, order: index + 1, officialRank: standing.rank, status: ru.status, laps: ru.completedLaps, progress: ru.normalizedCoursePosition / boundaryCount, gapNcu: Math.max(0, activeLead - ru.normalizedCoursePosition), finishTime: ru.finishTimeSeconds };
  });
}
/** Full own detail; opponents expose only currently perceived observations. */
export function selectedDetail(config: DeepReadonly<InitialConfiguration>, state: ViewState, id: string) {
  const player = config.scenario.entries.find(e => e.isPlayer); const ru = state.ruStates[id];
  if (!ru) return { visibility: 'unknown' };
  if (player?.id === id) return { visibility: 'own', speed: ru.speedMps, targetSpeed: ru.targetSpeedMps, fatigue: ru.teamFatigue, status: ru.status, strategy: config.scenario.entries.find(e => e.id === id)!.preRaceStrategy, sign: ru.activeSignId, behavior: ru.aiDecision?.chosen.mode ?? 'fixture', components: [ru.driver, ru.chariot, ...ru.beasts], cooldowns: ru.cooldowns };
  const observation = player ? perceive(config, state, player.id).objects.find(object => object.id === id) : undefined;
  return observation ? { visibility: 'perceived', observation } : { visibility: 'outside player perception' };
}
