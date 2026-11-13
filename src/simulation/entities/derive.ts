import { traitFactors } from '../environment/traits.ts';
import type { Hazard } from '../../contracts/environment.ts';
import type { DeepReadonly, InitialConfiguration, InitialRUState } from '../../contracts/initialization.ts';
import type { DerivedStats } from '../../contracts/movement.ts';
import { laneConditions } from '../movement/conditions.ts';
import { clamp } from '../../shared/math.ts';
export { clamp } from '../../shared/math.ts';
/** B.3/B.7 provisional formula family. Every coefficient comes from tuning JSON. */
export function deriveStats(config: DeepReadonly<InitialConfiguration>, ru: DeepReadonly<Pick<InitialRUState, 'id' | 'tile' | 'beasts' | 'driver' | 'chariot'> & { teamFatigue: number; status: string; derivedOverrides?: { readonly maxSpeedMps?: number } }>, hazards: readonly DeepReadonly<Hazard>[] = []): DerivedStats {
  const entry = config.scenario.entries.find(entry => entry.id === ru.id)!;
  const tuning = config.content.tuningProfiles.find(profile => profile.id === config.scenario.tuningProfileId)!;
  const t = tuning.stats;
  const factor = (band: InitialRUState['driver']['band']) => band === 'functional' ? 1 : t.conditionFactors[band];
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const beasts = ru.beasts.map(state => ({ definition: config.content.beasts.find(beast => beast.id === state.id)!, state }));
  const avg = (key: 'speed' | 'power' | 'agility' | 'endurance' | 'discipline' | 'toughness') => mean(beasts.map(({ definition, state }) => definition[key] * factor(state.band)));
  const driver = config.content.drivers.find(driver => driver.id === entry.driverId)!;
  const chariot = config.content.chariots.find(chariot => chariot.id === entry.chariotId)!;
  const driving = driver.driving * factor(ru.driver.band);
  const beastHandling = driver.beastHandling * factor(ru.driver.band);
  const chariotFactor = factor(ru.chariot.band);
  const coordination = clamp(t.coordination.base + t.coordination.gain * avg('discipline') / 100, t.coordination.min, t.coordination.max);
  const teamSpeed = avg('speed') * coordination;
  const teamPower = Math.min(t.teamPower.cap, avg('power') * coordination * Math.sqrt(beasts.length / t.teamPower.referenceTeamSize));
  const teamAgility = avg('agility') * coordination;
  const teamEndurance = avg('endurance'); const teamToughness = avg('toughness');
  const loadFactor = clamp(1 - Math.max(0, chariot.weightKg - t.load.referenceKg) / t.load.divisor, t.load.min, t.load.max);
  const fatigueFactor = clamp(1 - ru.teamFatigue / t.fatigue.divisor, t.fatigue.min, t.fatigue.max);
  const damagePercent = (state: DeepReadonly<InitialRUState['driver']>) => (1 - state.health / state.maxHealth) * 100;
  const teamDamage = mean(ru.beasts.map(damagePercent));
  const weightedConditionDamage = (teamDamage * t.damage.beastWeight + damagePercent(ru.chariot) * t.damage.chariotWeight + damagePercent(ru.driver) * t.damage.driverWeight) / (t.damage.beastWeight + t.damage.chariotWeight + t.damage.driverWeight);
  const damageFactor = clamp(1 - weightedConditionDamage / t.damage.divisor, t.damage.min, t.damage.max);
  const track = config.content.tracks.find(track => track.id === config.scenario.trackId)!;
  const lane = track.segments.find(segment => segment.id === ru.tile.segmentId)!.lanes.find(lane => lane.index === ru.tile.lane)!;
  const weather = config.content.weather.find(weather => weather.id === config.scenario.weatherId)!;
  const roughness = hazards.filter(h => h.type === 'track_roughness' && h.tile.segmentId === ru.tile.segmentId && h.tile.lane === ru.tile.lane).length * tuning.environment.events.roughnessTractionDelta;
  const traction = clamp((lane.traction + roughness) * weather.traction * traitFactors(config, ru.id).traction, t.braking.tractionMin, t.braking.tractionMax);
  const rollingFactor = t.speed.rollingBase + t.speed.rollingScale * chariot.rollingEfficiency * chariotFactor / 100;
  const disabled = ru.status !== 'active';
  const combine = (weights: typeof t.handling, beast: number, cart: number) => clamp(weights.beast * beast + weights.chariot * cart + weights.driver * driving + weights.beastHandling * beastHandling, 0, 100);
  const derived: DerivedStats = {
    maxSpeedMps: disabled ? 0 : (t.speed.base + t.speed.perTeamSpeed * teamSpeed) * rollingFactor * loadFactor * fatigueFactor * damageFactor,
    accelMps2: disabled ? 0 : (t.acceleration.base + t.acceleration.perTeamPower * teamPower) * loadFactor * fatigueFactor,
    brakeMps2: (t.braking.base + t.braking.perTeamAgility * teamAgility + t.braking.perDriving * driving) * traction,
    handling: combine(t.handling, teamAgility, chariot.maneuverability * chariotFactor),
    stability: combine(t.stability, teamToughness, chariot.stability * chariotFactor),
    endurance: combine(t.endurance, teamEndurance, 0),
    breakdown: { coordination, teamSpeed, teamPower, teamAgility, teamEndurance, teamToughness, loadFactor, fatigueFactor, teamDamage, weightedConditionDamage, damageFactor, rollingFactor, traction, driving, beastHandling, chariotFactor, ...Object.fromEntries(beasts.map(({ state }) => [`conditionFactor.${state.id}`, factor(state.band)])) },
  };
  if (!disabled && ru.derivedOverrides?.maxSpeedMps !== undefined) { derived.breakdown['original.maxSpeedMps'] = derived.maxSpeedMps; derived.maxSpeedMps = ru.derivedOverrides.maxSpeedMps; derived.breakdown['override.maxSpeedMps'] = derived.maxSpeedMps; }
  derived.breakdown.safeCornerSpeedMps = laneConditions(config, ru.tile, derived.maxSpeedMps, derived.handling, hazards, ru.id).safeSpeed;
  return derived;
}
