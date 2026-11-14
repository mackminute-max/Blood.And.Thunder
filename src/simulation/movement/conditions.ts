import { weatherFactors } from '../environment/weather.ts';
import { traitFactors } from '../environment/traits.ts';
import type { Hazard } from '../../contracts/environment.ts';
import type { DeepReadonly, InitialConfiguration } from '../../contracts/initialization.ts';
import type { TileRef } from '../../configuration/schemas.ts';
import { clamp } from '../../shared/math.ts';
export function laneConditions(config: DeepReadonly<InitialConfiguration>, tile: DeepReadonly<TileRef>, maxSpeed: number, handling: number, hazards: readonly DeepReadonly<Hazard>[] = [], ruId?: string) {
  const track = config.content.tracks.find(track => track.id === config.scenario.trackId)!;
  const segment = track.segments.find(segment => segment.id === tile.segmentId)!;
  const lane = segment.lanes.find(lane => lane.index === tile.lane)!;
  const weather = weatherFactors(config);
  const tuning = config.content.tuningProfiles.find(profile => profile.id === config.scenario.tuningProfileId)!.movement.handling;
  const roughness = hazards.filter(h => h.type === 'track_roughness' && h.tile.segmentId === tile.segmentId && h.tile.lane === tile.lane).length * config.content.tuningProfiles.find(p => p.id === config.scenario.tuningProfileId)!.environment.events.roughnessTractionDelta;
  const attributes = config.content.tuningProfiles.find(p => p.id === config.scenario.tuningProfileId)!.attributes;
  const intrinsicFactor = 1 / (1 + lane.roughness * attributes.roughnessTractionWeight);
  const severityFactor = 1 / Math.max(.1, 1 + (segment.severity - attributes.severityReference) * attributes.severitySpeedWeight);
  const traction = clamp((lane.traction * intrinsicFactor + roughness) * weather.traction * traitFactors(config, ruId).traction, tuning.cornerTractionMin, tuning.cornerTractionMax);
  const safeSpeed = segment.kind === 'corner' ? maxSpeed * lane.cornerSpeedFactor * severityFactor * traction * (tuning.cornerHandlingBase + tuning.cornerHandlingScale * handling / 100) : maxSpeed;
  return { traction, intrinsicFactor, severityFactor, safeSpeed, corner: segment.kind === 'corner', turn: segment.turn };
}
export function handlingCheck(config: DeepReadonly<InitialConfiguration>, handling: number, speed: number, conditions: ReturnType<typeof laneConditions>, draw: () => number) {
  const t = config.content.tuningProfiles.find(profile => profile.id === config.scenario.tuningProfileId)!.movement.handling;
  const difficult = conditions.traction < t.favorableTraction || handling < t.favorableHandling || speed > conditions.safeSpeed;
  if (!difficult) return { difficult: false, accepted: true, probability: 1, roll: null, score: handling };
  const overspeed = conditions.safeSpeed > 0 ? Math.max(0, speed / conditions.safeSpeed - 1) : speed > 0 ? Number.MAX_SAFE_INTEGER : 0;
  const score = handling + t.tractionScoreWeight * (conditions.traction - 1) - t.overspeedScoreWeight * overspeed;
  if (!Number.isFinite(score)) throw new Error('Nonfinite handling score');
  const probability = clamp(t.probabilityBase + (score - t.scoreCenter) / t.scoreDivisor, t.minProbability, t.maxProbability);
  const roll = draw();
  return { difficult: true, accepted: roll < probability, probability, roll, score };
}
