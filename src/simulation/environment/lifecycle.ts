import { traceDiagnostic } from '../core/diagnostics.ts';
import type { DeepReadonly, InitialConfiguration } from '../../contracts/initialization.ts';
import type { MovementState, MovementRU, MovementEventInput, MovementDiagnostic } from '../../contracts/movement.ts';
import type { HazardType, EnvironmentState } from '../../contracts/environment.ts';
import { createRng } from '../core/rng.ts';
export type EnvironmentRace = Pick<MovementState, 'tick' | 'ruStates' | 'hazards' | 'environment' | 'rngStates'>;
export const occupiesRu = (ru: DeepReadonly<Pick<MovementRU, 'status' | 'wreckRemoved'>>) => ru.status === 'active' || ru.status === 'disabled' && !ru.wreckRemoved;
const same = (a: { segmentId: string; lane: number }, b: { segmentId: string; lane: number }) => a.segmentId === b.segmentId && a.lane === b.lane;
/** One seeded Poisson CDF draw, capped at maxEvents; no guaranteed event. */
export function initializeEnvironment(config: DeepReadonly<InitialConfiguration>, state: Pick<MovementState, 'ruStates' | 'rngStates'>): EnvironmentState {
  const tuning = config.content.tuningProfiles.find(t => t.id === config.scenario.tuningProfileId)!;
  const track = config.content.tracks.find(t => t.id === config.scenario.trackId)!;
  const active = Object.values(state.ruStates).filter(ru => ru.status === 'active');
  const meanSpeed = active.reduce((sum, ru) => sum + ru.derived.maxSpeedMps, 0) / Math.max(1, active.length);
  const meters = track.segments.reduce((sum, segment) => sum + segment.meters * segment.lanes.reduce((sum, lane) => sum + lane.lengthMultiplier, 0) / segment.lanes.length, 0);
  const expectedRaceTicks = Math.min(config.scenario.rules.maxTicks, Math.max(1, Math.ceil(meters * config.scenario.rules.laps / Math.max(1, meanSpeed) / tuning.tickDurationSeconds)));
  const t = tuning.environment.events; const rng = createRng(state.rngStates.events);
  const schedule: EnvironmentState['schedule'] = config.scenario.environmentPlans.map(plan => ({ ...plan, id: `fixture:${plan.id}`, source: 'fixture' }));
  const rate = t.rates[config.scenario.eventIntensity];
  if (rate > 0 && t.maxEvents > 0) {
    const draw = rng.next(); let probability = Math.exp(-rate); let cdf = probability; let count = 0;
    while (draw > cdf && count < t.maxEvents) { count++; probability *= rate / count; cdf += probability; }
    const start = Math.max(1, Math.ceil(expectedRaceTicks * t.windowStart)); const end = Math.floor(expectedRaceTicks * t.windowEnd);
    // Draw from disjoint remaining tick intervals, enforcing spacing without unbounded retries.
    let windows = start <= end ? [{ start, end }] : [];
    for (let index = 0; index < count && windows.length; index++) {
      const total = windows.reduce((sum, w) => sum + w.end - w.start + 1, 0); let offset = Math.floor(rng.next() * total); let tick = start;
      for (const w of windows) { const size = w.end - w.start + 1; if (offset < size) { tick = w.start + offset; break; } offset -= size; }
      windows = windows.flatMap(w => [{ start: w.start, end: Math.min(w.end, tick - t.spacingTicks) }, { start: Math.max(w.start, tick + t.spacingTicks), end: w.end }].filter(w => w.start <= w.end));
      const types = Object.keys(t.weights).sort() as HazardType[]; let weight = rng.next() * types.reduce((sum, type) => sum + t.weights[type], 0); let type = types.at(-1)!;
      for (const candidate of types) { weight -= t.weights[candidate]; if (weight < 0) { type = candidate; break; } }
      schedule.push({ id: `external:${index}`, movementTick: tick, type, tile: null, durationTicks: t.durations[type], source: 'external' });
    }
  }
  schedule.sort((a, b) => a.movementTick - b.movementTick || (a.id < b.id ? -1 : 1));
  state.rngStates.events = [...rng.snapshot()];
  return { expectedRaceTicks, schedule, activatedEvents: 0, skippedEvents: 0 };
}
export function advanceEnvironment(config: DeepReadonly<InitialConfiguration>, state: EnvironmentRace, movementTick: number, emit: (event: MovementEventInput) => void, diagnostics: MovementDiagnostic[]) {
  const t = config.content.tuningProfiles.find(t => t.id === config.scenario.tuningProfileId)!.environment.events;
  const track = config.content.tracks.find(t => t.id === config.scenario.trackId)!;
  const rng = createRng(state.rngStates.events);
  for (const ru of Object.values(state.ruStates)) if (ru.status === 'disabled' && !ru.wreckRemoved) {
    ru.disabledAtMovementTick ??= 0;
    if (config.scenario.rules.wreckMode !== 'persistent' && (config.scenario.rules.wreckMode === 'immediate' || movementTick - ru.disabledAtMovementTick >= config.scenario.rules.disabledRemovalTicks)) {
      ru.wreckRemoved = true; emit({ type: 'wreck_removed', ruId: ru.id, fraction: 0, details: { movementTick, disabledAtMovementTick: ru.disabledAtMovementTick, tile: ru.tile, reason: 'cleanup_delay' } });
    }
  }
  state.hazards = state.hazards.filter(hazard => {
    if (movementTick < hazard.expiresAt) return true;
    emit({ type: 'hazard_expired', ruId: '', fraction: 0, details: { hazard, movementTick } }); return false;
  });
  const occupied = (tile: { segmentId: string; lane: number }) => Object.values(state.ruStates).some(ru => occupiesRu(ru) && same(ru.tile, tile)) || state.hazards.some(h => same(h.tile, tile));
  for (const hazard of state.hazards) if (hazard.type === 'animal_crossing' && movementTick > hazard.createdAt && (movementTick - hazard.createdAt) % t.animalStepTicks === 0) {
    const segment = track.segments.find(s => s.id === hazard.tile.segmentId)!;
    if (!segment.lanes.some(lane => lane.index === hazard.tile.lane + hazard.direction)) hazard.direction *= -1;
    const tile = { ...hazard.tile, lane: hazard.tile.lane + hazard.direction };
    if (segment.lanes.some(lane => lane.index === tile.lane) && !occupied(tile)) { const from = { ...hazard.tile }; hazard.tile = tile; emit({ type: 'hazard_moved', ruId: '', fraction: 0, details: { hazardId: hazard.id, from, to: tile } }); }
  }
  if (t.earlyWreckClear && config.scenario.rules.wreckMode !== 'persistent') for (const ru of Object.values(state.ruStates).sort((a, b) => a.id < b.id ? -1 : 1)) if (ru.status === 'active' && ru.blockedTicks >= t.earlyWreckClearBlockedTicks) {
    const lane = track.segments.find(s => s.id === ru.tile.segmentId)!.lanes.find(l => l.index === ru.tile.lane)!;
    const routes = [lane.next, ...lane.lateralNeighbors.map(index => ({ segmentId: ru.tile.segmentId, lane: index }))];
    const blocked = (tile: { segmentId: string; lane: number }) => Object.values(state.ruStates).some(other => occupiesRu(other) && same(other.tile, tile)) || state.hazards.some(h => h.type !== 'track_roughness' && same(h.tile, tile));
    if (routes.every(blocked)) {
      const wreck = Object.values(state.ruStates).filter(other => other.status === 'disabled' && !other.wreckRemoved && routes.some(tile => same(tile, other.tile))).sort((a, b) => a.id < b.id ? -1 : 1)[0];
      if (wreck) { wreck.wreckRemoved = true; emit({ type: 'wreck_removed', ruId: wreck.id, fraction: 0, details: { reason: 'blocked_route_safety', waitingRuId: ru.id, movementTick, tile: wreck.tile } }); }
    }
  }
  for (const incident of state.environment.schedule.filter(incident => incident.movementTick === movementTick)) {
    const candidates = incident.tile ? [incident.tile] : track.segments.flatMap(segment => segment.lanes.map(lane => ({ segmentId: segment.id, lane: lane.index }))).filter(tile => {
      const order = track.segments.find(s => s.id === tile.segmentId)!.order;
      return Object.values(state.ruStates).filter(ru => ru.status === 'active').every(ru => { const from = track.segments.find(s => s.id === ru.tile.segmentId)!.order; return (order - from + track.segments.length) % track.segments.length > t.placementBufferSegments; });
    });
    const free = candidates.filter(tile => !occupied(tile));
    if (!free.length) { state.environment.skippedEvents++; emit({ type: 'hazard_skipped', ruId: '', fraction: 0, details: { incident, reason: 'no_legal_free_tile' } }); continue; }
    const tile = { ...free[incident.tile ? 0 : Math.floor(rng.next() * free.length)]! };
    const hazard = { id: incident.id, type: incident.type, tile, createdAt: movementTick, expiresAt: movementTick + incident.durationTicks, direction: 1, source: incident.source };
    state.hazards.push(hazard); state.environment.activatedEvents++;
    emit({ type: 'hazard_activated', ruId: '', fraction: 0, details: { hazard, movementTick } });
  }
  state.hazards.sort((a, b) => a.id < b.id ? -1 : 1); state.rngStates.events = [...rng.snapshot()];
  traceDiagnostic(diagnostics, () => ({ tick: state.tick, substep: 0, level: 'trace', subsystem: 'environment', message: 'Advanced incident lifecycles and delayed wreck cleanup', details: { movementTick, hazards: state.hazards, environment: state.environment } }));
}
export function markDisabled(state: EnvironmentRace, movementTick: number, config: DeepReadonly<InitialConfiguration>, emit: (event: MovementEventInput) => void) {
  for (const ru of Object.values(state.ruStates)) if (ru.status === 'disabled') {
    ru.disabledAtMovementTick ??= movementTick;
    if (!ru.wreckRemoved && config.scenario.rules.wreckMode !== 'persistent' && (config.scenario.rules.wreckMode === 'immediate' || config.scenario.rules.disabledRemovalTicks === 0)) { ru.wreckRemoved = true; emit({ type: 'wreck_removed', ruId: ru.id, fraction: 1, details: { reason: 'zero_delay', movementTick, tile: ru.tile } }); }
  }
}
export function assertEnvironmentState(state: DeepReadonly<EnvironmentRace>) {
  const tiles = new Set<string>();
  for (const hazard of state.hazards) {
    const key = `${hazard.tile.segmentId}:${hazard.tile.lane}`;
    if (tiles.has(key) || hazard.expiresAt <= hazard.createdAt || hazard.type !== 'track_roughness' && Object.values(state.ruStates).some(ru => occupiesRu(ru) && same(ru.tile, hazard.tile))) throw new Error(`Invalid hazard occupancy/lifetime ${hazard.id}`);
    tiles.add(key);
  }
  for (const ru of Object.values(state.ruStates)) if (ru.teamFatigue < 0 || ru.teamFatigue > 100 || ru.wreckRemoved && ru.status !== 'disabled') throw new Error(`Invalid environment RU state ${ru.id}`);
}
