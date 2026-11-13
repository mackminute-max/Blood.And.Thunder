import { resolveContacts } from './contact.ts';
import type { ContactRequest } from './contact.ts';
import { occupiesRu } from '../environment/lifecycle.ts';
import type { DeepReadonly, InitialConfiguration } from '../../contracts/initialization.ts';
import type { MovementState, MovementEvent, MovementDiagnostic } from '../../contracts/movement.ts';
import type { RaceScenario, TileRef } from '../../configuration/schemas.ts';
import { createRng } from '../core/rng.ts';
import { deriveStats } from '../entities/derive.ts';
import { laneConditions, handlingCheck } from './conditions.ts';
import { arbitrate } from './arbitrate.ts';
import { resolveLanes } from './lanes.ts';
import type { MovementEventInput } from '../../contracts/movement.ts';
import { integrateSpeed } from './integrate.ts';

const tileKey = (tile: TileRef) => `${tile.segmentId}:${tile.lane}`;
interface Budget { total: number; remaining: number; spent: number; transitions: number; timeBase: number; baseBudget: number; spentSinceBase: number }
export interface MovementHooks {
  movementTick?: number; lanePlans?: DeepReadonly<RaceScenario['maneuvers']>;
  afterLateral?(emit: (event: MovementEventInput) => void, diagnostics: MovementDiagnostic[]): void;
  occupiesTile?(ruId: string): boolean;
  onEvent?(event: MovementEvent): void;
  onTransition?(event: Extract<MovementEvent, { type: 'movement_transition' }>): void;
}
interface Candidate { ruId: string; from: TileRef; to: TileRef; needed: number; fraction: number }
/** Fixed-tick lateral/longitudinal scheduling. Contact commits never retroactively change accepted transitions. */
export function moveTick(config: DeepReadonly<InitialConfiguration>, state: Pick<MovementState, 'tick' | 'ruStates' | 'rngStates'> & Partial<Pick<MovementState, 'hazards'>>, hooks: MovementHooks = {}) {
  const tuning = config.content.tuningProfiles.find(profile => profile.id === config.scenario.tuningProfileId)!;
  const track = config.content.tracks.find(track => track.id === config.scenario.trackId)!;
  const budgets = new Map<string, Budget>();
  const events: MovementEvent[] = []; const diagnostics: MovementDiagnostic[] = [];
  const ids = Object.keys(state.ruStates).sort();
  const blocked = new Set<string>();
  const rng = createRng(state.rngStates.tieBreak);
  const movementRng = createRng(state.rngStates.movement);
  const occupies = (id: string) => hooks.occupiesTile?.(id) ?? occupiesRu(state.ruStates[id]!);
  let substep = 0; let sequence = 0;
  const emit = (event: MovementEventInput) => {
    const emitted = { ...event, id: `${state.tick}:${substep}:${sequence++}`, tick: state.tick, substep };
    events.push(emitted); hooks.onEvent?.(emitted);
    if (emitted.type === 'movement_transition') hooks.onTransition?.(emitted);
  };
  for (const id of ids) if (state.ruStates[id]!.status === 'active') state.ruStates[id]!.derived = deriveStats(config, state.ruStates[id]!, state.hazards);
  const lateralOccupancy = new Map(ids.filter(occupies).map(id => [tileKey(state.ruStates[id]!.tile), id]));
  const aborts = resolveLanes(config, state, hooks.movementTick ?? state.tick, occupies, movementRng.next, rng.nextUint32, emit, diagnostics, hooks.lanePlans);
  for (const id of ids) if (state.ruStates[id]!.status === 'active') state.ruStates[id]!.derived = deriveStats(config, state.ruStates[id]!, state.hazards);
  const lateralContacts: ContactRequest[] = [];
  for (const event of [...events]) if (event.type === 'lane_change_resolved' && !event.accepted && ['occupied', 'contested', 'reciprocal'].includes(event.reason)) {
    const targetId = lateralOccupancy.get(tileKey(event.to)) ?? ids.find(id => id !== event.ruId && occupies(id) && tileKey(state.ruStates[id]!.tile) === tileKey(event.to));
    if (targetId) lateralContacts.push({ actorId: event.ruId, targetId, lateral: true, fraction: 0, closingSpeed: Math.abs(event.speedBefore - state.ruStates[targetId]!.speedMps) });
  }
  resolveContacts(config, state, lateralContacts, movementRng.next, emit, diagnostics, substep);
  hooks.afterLateral?.(emit, diagnostics);
  for (const id of ids) {
    const ru = state.ruStates[id]!;
    if (ru.status !== 'active') continue;
    const conditions = laneConditions(config, ru.tile, ru.derived.maxSpeedMps, ru.derived.handling, state.hazards, ru.id);
    if (tuning.movement.respectSafeCornerSpeed && conditions.corner) ru.targetSpeedMps = Math.min(ru.targetSpeedMps, conditions.safeSpeed);
    const oldSpeed = ru.speedMps;
    const integrated = integrateSpeed(oldSpeed, ru.targetSpeedMps, ru.derived.accelMps2, ru.derived.brakeMps2, ru.derived.maxSpeedMps, tuning.tickDurationSeconds);
    ru.speedMps = integrated.speedMps;
    budgets.set(id, { total: integrated.travelMeters, remaining: integrated.travelMeters, spent: 0, transitions: 0, timeBase: 0, baseBudget: integrated.travelMeters, spentSinceBase: 0 });
    if (aborts.has(id)) { budgets.delete(id); blocked.add(id); }
    diagnostics.push({ tick: state.tick, substep, level: 'trace', subsystem: 'movement', ruId: id, message: 'Integrated fixed-tick movement intent', details: { abortForward: aborts.has(id), discardedMeters: aborts.has(id) ? integrated.travelMeters : 0, safeCornerSpeed: conditions.safeSpeed, oldSpeed, targetSpeedMps: ru.targetSpeedMps, ...integrated, dt: tuning.tickDurationSeconds } });
  }
  while (budgets.size) {
    const candidates: Candidate[] = [];
    for (const [id, budget] of budgets) {
      const ru = state.ruStates[id]!;
      if (ru.status !== 'active') { budgets.delete(id); continue; }
      const segment = track.segments.find(segment => segment.id === ru.tile.segmentId)!;
      const lane = segment.lanes.find(lane => lane.index === ru.tile.lane)!;
      const cost = segment.meters * lane.lengthMultiplier;
      if (!Number.isFinite(cost) || cost <= 0) throw new Error(`Invalid traversal cost for ${id}`);
      const needed = (1 - ru.progressInSegment) * cost;
      if (budget.remaining < needed || budget.remaining === 0) {
        ru.progressInSegment += budget.remaining / cost;
        diagnostics.push({ tick: state.tick, substep, level: 'trace', subsystem: 'movement', ruId: id, message: 'Retained ordinary fractional progress', details: { meters: budget.remaining, tileCost: cost, progressInSegment: ru.progressInSegment } });
        budgets.delete(id);
      } else {
        if (budget.transitions >= tuning.movement.maxTransitionsPerTick) throw new Error(`Transition cap exceeded for ${id}`);
        candidates.push({ ruId: id, from: { ...ru.tile }, to: { ...lane.next }, needed, fraction: budget.timeBase + (budget.spentSinceBase + needed) / budget.baseBudget * (1 - budget.timeBase) });
      }
    }
    if (!candidates.length) break;
    candidates.sort((a, b) => a.fraction - b.fraction || (a.ruId < b.ruId ? -1 : 1));
    const earliest = candidates[0]!.fraction;
    const group = candidates.filter(candidate => candidate.fraction - earliest <= tuning.movement.arrivalEpsilon).sort((a, b) => a.ruId < b.ruId ? -1 : 1);
    substep++; sequence = 0;
    const occupancy = new Map(ids.filter(occupies).map(id => [tileKey(state.ruStates[id]!.tile), id]));
    const hazardBlocked = new Set(group.filter(candidate => state.hazards?.some(h => h.type !== 'track_roughness' && tileKey(h.tile) === tileKey(candidate.to))).map(candidate => candidate.ruId));
    const arbitration = arbitrate(group.filter(candidate => !hazardBlocked.has(candidate.ruId)).map(candidate => ({ ruId: candidate.ruId, fromKey: tileKey(candidate.from), toKey: tileKey(candidate.to), stability: state.ruStates[candidate.ruId]!.derived.stability, priority: 2, fraction: candidate.fraction })), occupancy, rng.nextUint32);
    const { accepted, reasons, ties: tieValues } = arbitration;
    const groupSpeeds = new Map(ids.map(id => [id, state.ruStates[id]!.speedMps]));
    const contacts: ContactRequest[] = [];
    // Resolve every candidate, then commit this atomic group's legal destinations.
    for (const candidate of group) {
      const budget = budgets.get(candidate.ruId)!;
      const ru = state.ruStates[candidate.ruId]!;
      if (!accepted.has(candidate.ruId)) {
        blocked.add(candidate.ruId);
        const reason = hazardBlocked.has(candidate.ruId) ? 'hazard' : reasons.get(candidate.ruId) ?? 'occupied';
        const occupantId = occupancy.get(tileKey(candidate.to));
        const occupantSpeed = occupantId ? groupSpeeds.get(occupantId)! : groupSpeeds.get(ru.id)!;
        const closingSpeed = Math.max(0, groupSpeeds.get(ru.id)! - occupantSpeed);
        const stoppingMeters = closingSpeed > 0 && ru.derived.brakeMps2 > 0 ? closingSpeed * closingSpeed / (2 * ru.derived.brakeMps2) : closingSpeed > 0 ? Number.MAX_SAFE_INTEGER : 0;
        const outcome = stoppingMeters > candidate.needed ? 'brake' as const : 'yield' as const;
        const contactTarget = occupantId ?? group.find(other => other.ruId !== candidate.ruId && accepted.has(other.ruId) && tileKey(other.to) === tileKey(candidate.to))?.ruId;
        if (reason !== 'hazard' && contactTarget && (outcome === 'brake' || reason === 'contested' || reason === 'reciprocal')) contacts.push({ actorId: candidate.ruId, targetId: contactTarget, lateral: reason !== 'occupied', fraction: candidate.fraction, closingSpeed: Math.abs(groupSpeeds.get(ru.id)! - groupSpeeds.get(contactTarget)!) });
        if (outcome === 'brake') ru.speedMps *= tuning.movement.conflict.brakeFactor;
        emit({ type: 'movement_blocked' , ruId: candidate.ruId, fraction: candidate.fraction, from: candidate.from, to: candidate.to, discardedMeters: budget.remaining, reason, outcome });
        diagnostics.push({ tick: state.tick, substep, level: 'trace', subsystem: 'movement', ruId: candidate.ruId, message: 'Rejected transition; discarded unused travel and resolved yield/brake before a separate contact check', details: { ...candidate, reason, outcome, closingSpeed, stoppingMeters, discardedMeters: budget.remaining, stability: ru.derived.stability, tieValue: tieValues.get(candidate.ruId) ?? null, acceptedRuIds: [...accepted].sort() } });
        budgets.delete(candidate.ruId);
      } else {
        budget.remaining = Math.max(0, budget.remaining - candidate.needed);
        budget.spent += candidate.needed; budget.spentSinceBase += candidate.needed; budget.transitions++;
        ru.tile = { ...candidate.to }; ru.progressInSegment = 0;
        const crossedStartLine = track.segments.find(segment => segment.id === candidate.to.segmentId)!.startFinishBoundary;
        emit({ type: 'movement_transition', ruId: candidate.ruId, fraction: candidate.fraction, from: candidate.from, to: candidate.to, crossedStartLine });
        if (ru.status !== 'active') budgets.delete(candidate.ruId);
        const previousSegment = track.segments.find(segment => segment.id === candidate.from.segmentId)!;
        const entered = laneConditions(config, ru.tile, ru.derived.maxSpeedMps, ru.derived.handling, state.hazards, ru.id);
        if (ru.status === 'active' && entered.corner && (previousSegment.kind !== 'corner' || previousSegment.turn !== entered.turn) && ru.speedMps > entered.safeSpeed) {
          const speedBefore = ru.speedMps;
          const check = handlingCheck(config, ru.derived.handling, ru.speedMps, entered, movementRng.next);
          if (!check.accepted) {
            ru.speedMps *= tuning.movement.handling.failureSpeedFactor;
            budget.remaining *= tuning.movement.handling.failureSpeedFactor;
            budget.timeBase = candidate.fraction; budget.baseBudget = budget.remaining; budget.spentSinceBase = 0;
          }
          emit({ type: 'handling_check', context: 'corner_entry', ruId: ru.id, fraction: candidate.fraction, accepted: check.accepted, probability: check.probability, roll: check.roll, safeSpeed: entered.safeSpeed, speedBefore, speedAfter: ru.speedMps });
          diagnostics.push({ tick: state.tick, substep, level: 'trace', subsystem: 'movement', ruId: ru.id, message: 'Checked corner entry once', details: { ...check, safeSpeed: entered.safeSpeed, remainingMeters: budget.remaining } });
        }
        diagnostics.push({ tick: state.tick, substep, level: 'trace', subsystem: 'movement', ruId: candidate.ruId, message: 'Accepted intermediate transition', details: { ...candidate, remainingMeters: budget.remaining, tieValue: tieValues.get(candidate.ruId) ?? null } });
      }
    }
      const beforeContact = new Map(ids.map(id => [id, state.ruStates[id]!.speedMps]));
    resolveContacts(config, state, contacts, movementRng.next, emit, diagnostics, substep);
    for (const [id, budget] of budgets) {
      const ru = state.ruStates[id]!;
      if (ru.status !== 'active') { budgets.delete(id); continue; }
      const before = beforeContact.get(id)!;
      if (before > 0 && ru.speedMps < before) { budget.remaining *= ru.speedMps / before; budget.timeBase = earliest; budget.baseBudget = budget.remaining; budget.spentSinceBase = 0; }
    }
  }
  for (const id of ids) state.ruStates[id]!.blockedTicks = blocked.has(id) ? state.ruStates[id]!.blockedTicks + 1 : 0;
  for (const id of ids) {
    const ru = state.ruStates[id]!;
    if (ru.status !== 'active') continue;
    if (ru.blockedTicks === tuning.movement.conflict.deadlockWarningTicks) diagnostics.push({ tick: state.tick, substep, level: 'warning', subsystem: 'movement', ruId: id, message: 'Consecutive blocked-tick warning', details: { blockedTicks: ru.blockedTicks } });
    if (ru.blockedTicks >= tuning.movement.conflict.deadlockRecoveryTicks) {
      ru.status = 'retired'; ru.statusReason = 'deadlock_recovery'; ru.speedMps = 0; ru.targetSpeedMps = 0;
      emit({ type: 'movement_recovery', ruId: id, fraction: 1, reason: 'deadlock', blockedTicks: ru.blockedTicks });
    }
  }
  state.rngStates.movement = [...movementRng.snapshot()];
  state.rngStates.tieBreak = [...rng.snapshot()];
  return { events, diagnostics };
}
