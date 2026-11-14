import { stateHash } from '../../diagnostics/state-hash.ts';
import type { RaceState, FinishRecord, RaceResult } from '../../contracts/race.ts';
import type { DeepReadonly, InitialConfiguration } from '../../contracts/initialization.ts';
const compareId = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
/** Competition ranks, tolerance relative to the first finisher of each tie group.
 * ID orders equal-time rows for display only, never breaks an official tie. */
export function rankFinishes(records: readonly Pick<FinishRecord, 'ruId' | 'finishTimeSeconds'>[], tolerance: number): FinishRecord[] {
  const sorted = records.map(record => ({ ...record, rank: 0, tiedWith: [] as string[] })).sort((a, b) => a.finishTimeSeconds - b.finishTimeSeconds || compareId(a.ruId, b.ruId));
  let index = 0;
  while (index < sorted.length) {
    let end = index + 1;
    while (end < sorted.length && sorted[end]!.finishTimeSeconds - sorted[index]!.finishTimeSeconds <= tolerance) end++;
    const group = sorted.slice(index, end);
    for (const record of group) { record.rank = index + 1; record.tiedWith = group.filter(other => other.ruId !== record.ruId).map(other => other.ruId).sort(); }
    index = end;
  }
  return sorted;
}
export function updateStandings(state: RaceState): void {
  state.standings = Object.values(state.ruStates).map(ru => ({ ruId: ru.id, status: ru.status, normalizedCoursePosition: ru.normalizedCoursePosition, rank: state.finishRecords.find(record => record.ruId === ru.id)?.rank ?? null }));
  state.standings.sort((a, b) => {
    if (a.rank !== null || b.rank !== null) return (a.rank ?? Infinity) - (b.rank ?? Infinity) || compareId(a.ruId, b.ruId);
    return b.normalizedCoursePosition - a.normalizedCoursePosition || compareId(a.ruId, b.ruId);
  });
}
export function buildResult(config: DeepReadonly<InitialConfiguration>, state: RaceState, outcome: RaceResult['outcome']): RaceResult {
  updateStandings(state);
  const dt = config.content.tuningProfiles.find(profile => profile.id === config.scenario.tuningProfileId)!.tickDurationSeconds;
  return {
    competitionStyle: config.scenario.rules.competitionStyle, schemaVersion: config.scenario.schemaVersion, simulationVersion: config.scenario.simulationVersion,
    scenarioId: config.scenario.id, seed: config.scenario.seed, outcome, finalStateHash: stateHash({ ...state, result: null }), endTick: state.tick,
    elapsedRaceSeconds: state.elapsedRaceTicks * dt,
    winnerIds: outcome === 'classified' ? state.finishRecords.filter(record => record.rank === 1).map(record => record.ruId).sort() : [],
    classification: state.standings.map(standing => {
      const ru = state.ruStates[standing.ruId]!;
      return { ruId: ru.id, status: ru.status, reason: ru.statusReason ?? null, rank: standing.rank,
        finishTimeSeconds: ru.finishTimeSeconds, firstLapStartedAtSeconds: ru.firstLapStartedAtSeconds, completedLaps: ru.completedLaps, normalizedCoursePosition: ru.normalizedCoursePosition,
        components: [ru.driver, ru.chariot, ...ru.beasts],
        stats: { ...ru.raceStats, ...ru.combatStats, ...ru.environmentStats, averageFatigue: ru.environmentStats.fatigueSamples ? ru.environmentStats.fatigueTotal / ru.environmentStats.fatigueSamples : 0, acceptedTransitions: ru.acceptedTransitions, blockedTransitions: ru.blockedTransitions, startLineCrossings: ru.startLineCrossings, signUsage: ru.signUsage, activeSignId: ru.activeSignId, pendingSign: ru.pendingSign, signsUsed: config.scenario.rules.maxSignOpportunities - ru.signOpportunitiesRemaining } };
    }),
    environment: { activatedEvents: state.environment.activatedEvents, skippedEvents: state.environment.skippedEvents, scheduledExternalEvents: state.environment.schedule.filter(incident => incident.source === 'external').length },
    unavailableStatistics: ['penalties: no approved officiating policy; not assessed'],
  };
}
