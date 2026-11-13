import { traitFactors } from './traits.ts';
import type { DeepReadonly, InitialConfiguration } from '../../contracts/initialization.ts';
import type { MovementState, MovementEventInput } from '../../contracts/movement.ts';
import { clamp } from '../../shared/math.ts';
export function applyFatigue(config: DeepReadonly<InitialConfiguration>, state: Pick<MovementState, 'ruStates'>, startSpeeds: ReadonlyMap<string, number>, emit: (event: MovementEventInput) => void) {
  const tuning = config.content.tuningProfiles.find(t => t.id === config.scenario.tuningProfileId)!; const t = tuning.environment.fatigue; const dt = tuning.tickDurationSeconds;
  const weather = config.content.weather.find(w => w.id === config.scenario.weatherId)!;
  for (const id of Object.keys(state.ruStates).sort()) {
    const ru = state.ruStates[id]!; if (!startSpeeds.has(id)) continue;
    const oldFatigue = ru.teamFatigue; const acceleration = (ru.speedMps - startSpeeds.get(id)!) / dt;
    const ratio = ru.speedMps / Math.max(1, ru.derived.maxSpeedMps);
    const exertion = clamp(t.exertionBase + t.speedWeight * ratio + t.accelerationWeight * Math.max(0, acceleration / t.accelerationDivisor), t.exertionMin, t.exertionMax);
    const multiplier = ru.activeSignId === 'push-hard' ? tuning.ai.pushFatigueMultiplier : 1;
    const recovery = ratio < t.recoverySpeedRatio && acceleration <= 0 ? dt * t.recoveryPerSecond : 0;
    const gain = dt * t.basePerSecond * exertion * Math.max(0, t.enduranceBase - ru.derived.endurance / t.enduranceDivisor) * weather.fatigue * traitFactors(config, id).fatigue * multiplier;
    ru.teamFatigue = clamp(oldFatigue + gain - recovery, 0, 100);
    ru.environmentStats.fatigueSamples++; ru.environmentStats.fatigueTotal += ru.teamFatigue; ru.environmentStats.maxFatigue = Math.max(ru.environmentStats.maxFatigue, ru.teamFatigue);
    emit({ type: 'fatigue_changed', ruId: id, fraction: 1, details: { oldFatigue, newFatigue: ru.teamFatigue, gain, recovery, exertion, acceleration, weatherFactor: weather.fatigue, signMultiplier: multiplier, appliesToDerivedStats: 'next_tick' } });
  }
}
