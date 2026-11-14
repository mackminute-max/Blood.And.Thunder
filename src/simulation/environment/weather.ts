import type { DeepReadonly, InitialConfiguration } from '../../contracts/initialization.ts';
/** Fixed-race weather dimensions modify existing consumers; they never move an RU. */
export function weatherFactors(config: DeepReadonly<InitialConfiguration>) {
  const weather = config.content.weather.find(w => w.id === config.scenario.weatherId)!;
  const effects = config.content.tuningProfiles.find(t => t.id === config.scenario.tuningProfileId)!.environment.weatherEffects;
  return {
    traction: weather.traction * (1 - weather.precipitation * weather.intensity * effects.precipitationTractionLoss),
    visibility: weather.visibility,
    fatigue: weather.fatigue * (1 + Math.abs(weather.windMps) * effects.windFatiguePerMps + Math.abs(weather.temperatureC - effects.comfortableTemperatureC) * effects.temperatureFatiguePerDegree),
  };
}
