import { traceDiagnostic } from '../core/diagnostics.ts';
import type { DeepReadonly, InitialConfiguration } from '../../contracts/initialization.ts';
import type { RaceScenario } from '../../configuration/schemas.ts';
import type { MovementState, MovementDiagnostic, MovementEventInput } from '../../contracts/movement.ts';
import { arbitrate, propagateDepartures } from './arbitrate.ts';
import { handlingCheck, laneConditions } from './conditions.ts';
const key = (tile: { segmentId: string; lane: number }) => `${tile.segmentId}:${tile.lane}`;
export function resolveLanes(config: DeepReadonly<InitialConfiguration>, state: Pick<MovementState, 'tick' | 'ruStates'> & Partial<Pick<MovementState, 'hazards'>>, movementTick: number,
  occupies: (id: string) => boolean, movementDraw: () => number, tieDraw: () => number,
  emit: (event: MovementEventInput) => void, diagnostics: MovementDiagnostic[], overridePlans?: DeepReadonly<RaceScenario['maneuvers']>) {
  const plans = (overridePlans ?? config.scenario.maneuvers).filter(plan => plan.movementTick === movementTick);
  const track = config.content.tracks.find(track => track.id === config.scenario.trackId)!;
  const tuning = config.content.tuningProfiles.find(profile => profile.id === config.scenario.tuningProfileId)!.movement.handling;
  const attempts = plans.map(plan => {
    const ru = state.ruStates[plan.ruId]!;
    const segment = track.segments.find(segment => segment.id === ru.tile.segmentId)!;
    const lane = segment.lanes.find(lane => lane.index === ru.tile.lane)!;
    const from = { ...ru.tile }; const to = { segmentId: from.segmentId, lane: from.lane + plan.laneDelta };
    emit({ type: 'lane_change_attempt', ruId: ru.id, fraction: 0, from, to });
    const hazard = state.hazards?.some(h => h.type !== 'track_roughness' && key(h.tile) === key(to));
    const reason = hazard ? 'hazard' : ru.status !== 'active' ? 'inactive' : !lane.lateralNeighbors.includes(to.lane) || !segment.lanes.some(lane => lane.index === to.lane) ? 'invalid_connection' : ru.speedMps === 0 && !config.scenario.rules.allowStationaryLaneChange ? 'stationary' : '';
    return { plan, ru, from, to, reason, speedBefore: ru.speedMps };
  });
  const occupancy = new Map(Object.keys(state.ruStates).filter(occupies).map(id => [key(state.ruStates[id]!.tile), id]));
  const arbitration = arbitrate(attempts.filter(attempt => !attempt.reason).map(attempt => ({ ruId: attempt.ru.id, fromKey: key(attempt.from), toKey: key(attempt.to), fraction: 0, priority: 1, stability: attempt.ru.derived.stability })), occupancy, tieDraw);
  const checks = new Map<string, ReturnType<typeof handlingCheck>>();
  for (const attempt of attempts) if (arbitration.accepted.has(attempt.ru.id)) {
    const check = handlingCheck(config, attempt.ru.derived.handling, attempt.ru.speedMps, laneConditions(config, attempt.to, attempt.ru.derived.maxSpeedMps, attempt.ru.derived.handling, state.hazards, attempt.ru.id), movementDraw);
    checks.set(attempt.ru.id, check);
    if (!check.accepted) { arbitration.accepted.delete(attempt.ru.id); attempt.reason = 'handling_failure'; attempt.ru.speedMps *= tuning.failureSpeedFactor; }
  }
  propagateDepartures(arbitration.accepted, arbitration.intents, occupancy, arbitration.reasons);
  const aborts = new Set<string>();
  for (const attempt of attempts) {
    const accepted = arbitration.accepted.has(attempt.ru.id);
    const reason = accepted ? 'accepted' : attempt.reason || arbitration.reasons.get(attempt.ru.id) || 'occupied';
    if (accepted) attempt.ru.tile = { ...attempt.to };
    else if (attempt.plan.abortIfBlocked && attempt.ru.status === 'active') aborts.add(attempt.ru.id);
    const check = checks.get(attempt.ru.id);
    emit({ type: 'lane_change_resolved', ruId: attempt.ru.id, fraction: 0, from: attempt.from, to: attempt.to, accepted, reason, speedBefore: attempt.speedBefore, speedAfter: attempt.ru.speedMps, probability: check?.probability ?? null, roll: check?.roll ?? null });
    traceDiagnostic(diagnostics, () => ({ tick: state.tick, substep: 0, level: 'trace', subsystem: 'movement', ruId: attempt.ru.id, message: 'Resolved tick-start lane intent', details: { plan: attempt.plan, from: attempt.from, to: attempt.to, accepted, reason, progressInSegment: attempt.ru.progressInSegment, check: check ?? null, tieValue: arbitration.ties.get(attempt.ru.id) ?? null, abortForward: aborts.has(attempt.ru.id) } }));
  }
  return aborts;
}
