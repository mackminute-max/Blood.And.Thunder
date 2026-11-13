import { occupiesRu } from '../environment/lifecycle.ts';
import type { DeepReadonly, InitialConfiguration } from '../../contracts/initialization.ts';
import type { MovementState, MovementEventInput, MovementEvent } from '../../contracts/movement.ts';
import type { AiDecision, Perception, CandidateScore, SpeedMode } from '../../contracts/ai.ts';
import { createRng } from '../core/rng.ts';
import { laneConditions } from '../movement/conditions.ts';
import { clamp } from '../../shared/math.ts';
import { copyJson } from '../../shared/immutable.ts';
const modes: SpeedMode[] = ['brake', 'conserve', 'cruise', 'push'];
type State = Pick<MovementState, 'tick' | 'ruStates' | 'rngStates'> & Partial<Pick<MovementState, 'hazards'>>;
export function perceive(config: DeepReadonly<InitialConfiguration>, state: DeepReadonly<State>, ruId: string): Perception {
  const ru = state.ruStates[ruId]!;
  const entry = config.scenario.entries.find(entry => entry.id === ruId)!;
  const driver = config.content.drivers.find(driver => driver.id === entry.driverId)!;
  const tuning = config.content.tuningProfiles.find(profile => profile.id === config.scenario.tuningProfileId)!;
  const t = tuning.ai;
  const track = config.content.tracks.find(track => track.id === config.scenario.trackId)!;
  const visibility = clamp(config.content.weather.find(weather => weather.id === config.scenario.weatherId)!.visibility, 0, 1);
  const effectiveAwareness = driver.awareness * (ru.driver.band === 'functional' ? 1 : tuning.stats.conditionFactors[ru.driver.band]);
  const aheadRange = Math.floor((t.awarenessBase + Math.floor(effectiveAwareness / t.awarenessDivisor)) * visibility);
  const behindRange = Math.floor(t.behindRange * visibility);
  const ownOrder = track.segments.find(segment => segment.id === ru.tile.segmentId)!.order;
  const objects = Object.values(state.ruStates).filter(other => other.id !== ruId && occupiesRu(other)).map(other => {
    const order = track.segments.find(segment => segment.id === other.tile.segmentId)!.order;
    const ahead = (order - ownOrder + track.segments.length) % track.segments.length;
    const behind = (ownOrder - order + track.segments.length) % track.segments.length;
    return { id: other.id, tile: { ...other.tile }, progressInSegment: other.progressInSegment, speedMps: other.speedMps, status: other.status, ahead, behind };
  }).filter(other => other.ahead === 0 || other.ahead <= aheadRange || other.behind <= behindRange).sort((a, b) => a.id < b.id ? -1 : 1);
  const hazards = (state.hazards ?? []).filter(hazard => { const order = track.segments.find(s => s.id === hazard.tile.segmentId)!.order; const ahead = (order - ownOrder + track.segments.length) % track.segments.length; const behind = (ownOrder - order + track.segments.length) % track.segments.length; return ahead === 0 || ahead <= aheadRange || behind <= behindRange; }).map(hazard => copyJson(hazard)).sort((a, b) => a.id < b.id ? -1 : 1);
  return { effectiveAwareness, aheadRange, behindRange, objects, hazards };
}
export function chooseIntents(config: DeepReadonly<InitialConfiguration>, state: State, movementTick: number, emit: (event: MovementEventInput) => void) {
  const t = config.content.tuningProfiles.find(profile => profile.id === config.scenario.tuningProfileId)!.ai;
  const track = config.content.tracks.find(track => track.id === config.scenario.trackId)!;
  const rng = createRng(state.rngStates.ai);
  const frozen = copyJson(state);
  const plans: { movementTick: number; ruId: string; laneDelta: -1 | 1; abortIfBlocked: boolean }[] = [];
  for (const id of Object.keys(state.ruStates).sort()) {
    const noiseBudget = Array.from({ length: 12 }, () => rng.next());
    let candidateIndex = 0;
    const ru = state.ruStates[id]!; if (ru.status !== 'active') continue;
    const entry = config.scenario.entries.find(entry => entry.id === id)!;
    const driver = config.content.drivers.find(driver => driver.id === entry.driverId)!;
    const p = driver.personality; const trait = (value: number) => (value - 50) / 50;
    const perception = perceive(config, frozen, id);
    const environment = config.content.tuningProfiles.find(p => p.id === config.scenario.tuningProfileId)!.environment.events;
    const memory = new Map((ru.aiMemory.hazards ?? []).filter(item => movementTick - item.lastSeen <= environment.memoryTicks && item.hazard.expiresAt > movementTick).map(item => [item.hazard.id, item]));
    for (const hazard of perception.hazards) memory.set(hazard.id, { hazard, lastSeen: movementTick });
    const newlySeen = perception.hazards.some(hazard => !ru.aiMemory.hazards.some(item => item.hazard.id === hazard.id));
    ru.aiMemory.hazards = [...memory.values()].sort((a, b) => a.hazard.id < b.hazard.id ? -1 : 1);
    if (newlySeen) ru.aiMemory.reevaluate = true;
    const segment = track.segments.find(segment => segment.id === ru.tile.segmentId)!;
    const currentLane = segment.lanes.find(lane => lane.index === ru.tile.lane)!;
    const candidates: CandidateScore[] = [];
    for (const mode of modes) for (const delta of [-1, 0, 1] as const) {
      const laneIndex = ru.tile.lane + delta; const lane = segment.lanes.find(lane => lane.index === laneIndex);
      const candidateId = `${mode}:${delta}`;
      const topology = delta === 0 || currentLane.lateralNeighbors.includes(laneIndex);
      const conditions = lane ? laneConditions(config, { segmentId: segment.id, lane: laneIndex }, ru.derived.maxSpeedMps, ru.derived.handling, perception.hazards, ru.id) : null;
      const ratio = t.speedRatios[mode]; const speed = ru.derived.maxSpeedMps * ratio;
      const occupant = perception.objects.some(other => other.tile.segmentId === segment.id && other.tile.lane === laneIndex);
      const ahead = perception.objects.filter(other => other.ahead > 0 && other.ahead <= perception.aheadRange && other.tile.lane === laneIndex).sort((a, b) => a.ahead - b.ahead || (a.id < b.id ? -1 : 1))[0];
      const hazardRisk = Math.max(0, ...ru.aiMemory.hazards.filter(item => item.hazard.tile.lane === laneIndex).map(item => { const order = track.segments.find(s => s.id === item.hazard.tile.segmentId)!.order; const ahead = (order - segment.order + track.segments.length) % track.segments.length; return ahead <= perception.aheadRange ? (item.hazard.type === 'track_roughness' ? .4 : 1) / Math.max(1, ahead) : 0; }));
      const ruRisk = occupant ? 1 : ahead ? clamp((speed - ahead.speedMps) / Math.max(1, ru.derived.maxSpeedMps), 0, 1) / ahead.ahead : 0;
      const risk = Math.max(ruRisk, hazardRisk);
      const overspeed = conditions && conditions.safeSpeed > 0 ? clamp(speed / conditions.safeSpeed - 1, 0, 1) : speed > 0 ? 1 : 0;
      const overtake = delta !== 0 && perception.objects.some(other => other.ahead > 0 && other.ahead <= perception.aheadRange && other.tile.lane === ru.tile.lane) && !occupant ? 1 : 0;
      const fatigue = ratio * ratio * (t.baseExertionCost + ru.teamFatigue / 100);
      const progress = lane ? clamp(ratio / lane.lengthMultiplier, 0, 1) : 0;
      let rejected = !lane || !topology ? 'invalid_topology' : delta !== 0 && ru.speedMps === 0 && !config.scenario.rules.allowStationaryLaneChange ? 'stationary' : null;
      if (!rejected && mode !== 'brake' && (risk >= t.safetyCollisionRisk || conditions && ru.speedMps > conditions.safeSpeed * t.safetyOverspeedRatio && speed > conditions.safeSpeed)) rejected = 'safety_braking_required';
      const personality = (t.aggressionRisk * trait(p.aggression) + t.riskToleranceRisk * trait(p.riskTolerance)) * risk + (mode === 'conserve' ? t.patienceConserve * trait(p.patience) : 0) + t.competitiveOvertake * trait(p.competitiveness) * overtake;
      const strategy = t.strategies[entry.preRaceStrategy][mode] + (entry.preRaceStrategy === 'opportunistic' && risk < t.safetyCollisionRisk ? t.opportunisticOvertake * overtake : 0) - (entry.preRaceStrategy === 'defensive' && delta !== 0 ? t.defendRisk * risk : 0);
      let sign = ru.activeSignId ? t.signs[ru.activeSignId][mode] : 0;
      if (ru.activeSignId === 'push-hard') sign += t.pushOvertake * overtake;
      if (ru.activeSignId === 'defend-position') sign += delta === 0 && ahead ? t.defendStay : -t.defendRisk * risk;
      sign *= 1 + t.disciplineSign * trait(p.discipline);
      const draw = noiseBudget[candidateIndex++]!;
      const noise = rejected ? 0 : (draw * 2 - 1) * t.noise;
      const switching = !ru.aiMemory.reevaluate && !ru.aiMemory.lastFailed && ru.aiMemory.targetLane !== null && laneIndex !== ru.aiMemory.targetLane ? -t.switchPenalty : 0;
      const factors = { hazard: -environment.hazardUtilityPenalty * hazardRisk, progress: t.progressWeight * progress, overtake: t.overtakeWeight * overtake, collision: -t.collisionWeight * risk, fatigue: -t.fatigueWeight * fatigue, corner: -t.cornerWeight * overspeed, personality, strategy, sign, noise, switching, collisionRisk: risk };
      const rawUtility = t.base + factors.hazard + factors.progress + factors.overtake + factors.collision + factors.fatigue + factors.corner + personality + strategy + sign + noise + switching;
      if (!Number.isFinite(rawUtility)) throw new Error(`Nonfinite AI utility for ${id}`);
      candidates.push({ id: candidateId, mode, laneDelta: delta, targetLane: laneIndex, targetSpeedMps: speed, rejected, utility: clamp(rawUtility, 0, 100), factors: { ...factors, rawUtility } });
    }
    const legal = candidates.filter(candidate => candidate.rejected === null);
    const committed = !ru.aiMemory.reevaluate && !ru.aiMemory.lastFailed && movementTick <= ru.aiMemory.commitmentUntil;
    const currentCritical = legal.every(candidate => candidate.targetLane !== ru.aiMemory.targetLane || candidate.mode === 'brake');
    const retained = committed && !currentCritical ? legal.filter(candidate => candidate.targetLane === ru.aiMemory.targetLane) : legal;
    const sorted = [...retained].sort((a, b) => b.utility - a.utility || (a.id < b.id ? -1 : 1));
    const chosen = sorted[0] ?? candidates.find(candidate => candidate.mode === 'brake' && candidate.laneDelta === 0)!;
    if (!committed || currentCritical || ru.aiMemory.reevaluate || ru.aiMemory.lastFailed) { ru.aiMemory.targetLane = chosen.targetLane; ru.aiMemory.commitmentUntil = movementTick + t.commitmentTicks - 1; }
    ru.aiMemory.reevaluate = false; ru.aiMemory.lastFailed = false;
    const decision: AiDecision = { fatigueGainMultiplier: ru.activeSignId === 'push-hard' ? t.pushFatigueMultiplier : 1, movementTick, perception, candidates, chosen, outcome: null, unavailableActions: [] };
    ru.aiDecision = decision; ru.targetSpeedMps = chosen.targetSpeedMps;
    if (chosen.laneDelta !== 0) plans.push({ movementTick, ruId: id, laneDelta: chosen.laneDelta, abortIfBlocked: false });
    emit({ type: 'ai_intent', ruId: id, fraction: 0, decision: copyJson(decision) });
  }
  state.rngStates.ai = [...rng.snapshot()];
  return plans;
}
export function recordAiOutcomes(state: State, events: readonly MovementEvent[], movementTick: number, emit: (event: MovementEventInput) => void) {
  for (const id of Object.keys(state.ruStates).sort()) {
    const ru = state.ruStates[id]!; if (!ru.aiDecision || ru.aiDecision.movementTick !== movementTick) continue;
    const own = events.filter(event => event.ruId === id);
    const blocked = own.some(event => event.type === 'movement_blocked');
    const laneRejected = own.some(event => event.type === 'lane_change_resolved' && !event.accepted);
    ru.aiDecision.outcome = { lane: ru.tile.lane, speedMps: ru.speedMps, blocked, laneRejected };
    ru.aiMemory.lastFailed = blocked || laneRejected;
    emit({ type: 'ai_outcome', ruId: id, fraction: 1, details: { chosen: ru.aiDecision.chosen, outcome: ru.aiDecision.outcome } });
  }
}
