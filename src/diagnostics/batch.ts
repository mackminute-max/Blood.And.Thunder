import type { DeepReadonly, InitialConfiguration } from '../contracts/initialization.ts';
import type { RaceState, RaceTickOutput } from '../contracts/race.ts';
import { createRaceEngine } from '../simulation/core/race-engine.ts';
import { stateHash } from './state-hash.ts';
export const REPORT_VERSION = 'blood-thunder-batch-e1';
export interface RunSummary {
  unavailableStatistics: readonly string[]; competitionStyle: string; perRu: readonly DeepReadonly<import('../contracts/race.ts').RaceClassification>[]; overtakes: number; timeLeadingSeconds: number;
  seed: string; configurationHash: string; tuningHash: string; finalHash: string; terminal: string; outcome: string; ticks: number; entrants: number; finished: number; finishRate: number;
  dnfReasons: Record<string, number>; lapTimes: number[]; winnerIds: readonly string[]; overtakesObserved: number; attacks: number; hits: number; ramAttempts: number; collisions: number; fatalities: number; injuries: number; destroyed: number; averageFatigue: number; maxFatigue: number; blockedTransitions: number; externalEvents: number; activatedEvents: number; signsUsed: number;
  laneSeconds: Record<string, number>; aiModes: Record<string, number>; statuses: Record<string, number>; warnings: Record<string, number>; failure: { message: string; diagnostic: unknown } | null;
}
const add = (map: Record<string, number>, key: string, amount = 1) => { map[key] = (map[key] ?? 0) + amount; };
export function createMetrics(config: DeepReadonly<InitialConfiguration>) {
  const laneSeconds: Record<string, number> = {}; const aiModes: Record<string, number> = {}; const warnings: Record<string, number> = {}; const lapTimes: number[] = []; const lapStarts = new Map<string, number>();
  const dt = config.content.tuningProfiles.find(p => p.id === config.scenario.tuningProfileId)!.tickDurationSeconds;
  let previous: DeepReadonly<RaceState> | null = null; let overtakesObserved = 0;
  for (const entry of config.scenario.entries) if (config.scenario.startingGrid[entry.id]!.segmentId === config.content.tracks.find(t => t.id === config.scenario.trackId)!.segments.find(s => s.startFinishBoundary)!.id) lapStarts.set(entry.id, 0);
  return {
    append(frame: RaceTickOutput) {
      const state = frame.state;
      if (previous && state.elapsedRaceTicks > previous.elapsedRaceTicks) {
        // Duration-weighted lane exposure, including accepted lateral and forward lane changes.
        for (const ru of Object.values(previous.ruStates).filter(ru => ru.status === 'active')) {
          let lane = ru.tile.lane; let fraction = 0;
          for (const event of frame.events.filter(e => 'ruId' in e && e.ruId === ru.id)) {
            if (event.type === 'lane_change_resolved' && event.accepted) lane = event.to.lane;
            if (event.type === 'movement_transition') { add(laneSeconds, `${ru.id}:${lane}`, Math.max(0, event.fraction - fraction) * dt); fraction = event.fraction; lane = event.to.lane; }
            if (event.type === 'ru_finished' || event.type === 'ru_retired' || event.type === 'ru_disabled') { const end = 'fraction' in event ? event.fraction : Math.max(0,Math.min(1,event.timeSeconds / dt - (state.elapsedRaceTicks - 1))); add(laneSeconds, `${ru.id}:${lane}`, Math.max(0,end-fraction)*dt); fraction = 1; }
          }
          add(laneSeconds, `${ru.id}:${lane}`, Math.max(0, 1 - fraction) * dt);
        }
        const active = Object.values(state.ruStates).filter(ru => ru.status === 'active' && previous!.ruStates[ru.id]?.status === 'active');
        for (const ru of active) for (const other of active) if (previous.ruStates[ru.id]!.normalizedCoursePosition < previous.ruStates[other.id]!.normalizedCoursePosition && ru.normalizedCoursePosition > other.normalizedCoursePosition) overtakesObserved++;
      }
      for (const ru of Object.values(state.ruStates)) if (ru.aiDecision?.movementTick === state.elapsedRaceTicks && (!previous || previous.elapsedRaceTicks < state.elapsedRaceTicks)) add(aiModes, `${ru.id}:${ru.aiDecision.chosen.mode}`);
      for (const e of frame.events) {
        if (e.type === 'lap_started') lapStarts.set(e.ruId!, e.timeSeconds);
        if (e.type === 'lap_crossed') { const start = lapStarts.get(e.ruId!); if (start !== undefined) lapTimes.push(e.timeSeconds - start); lapStarts.set(e.ruId!, e.timeSeconds); }
      }
      for (const diagnostic of frame.diagnostics) if (diagnostic.level === 'warning' || diagnostic.level === 'error') add(warnings, diagnostic.message);
      previous = state;
    },
    finish(engine: ReturnType<typeof createRaceEngine>): RunSummary {
      const state = engine.snapshot(); const units = Object.values(state.ruStates); const result = engine.result(); const reasons: Record<string, number> = {}; const statuses: Record<string, number> = {};
      for (const ru of units) { add(statuses, ru.status); if (ru.status !== 'finished') add(reasons, ru.statusReason ?? ru.status); }
      const sum = (fn: (ru: typeof units[number]) => number) => units.reduce((sum, ru) => sum + fn(ru), 0);
      const samples = sum(ru => ru.environmentStats.fatigueSamples);
      return { unavailableStatistics: result?.unavailableStatistics ?? ['result unavailable'], competitionStyle: config.scenario.rules.competitionStyle, perRu: result?.classification ?? [], overtakes: sum(ru=>ru.raceStats.overtakes), timeLeadingSeconds: sum(ru=>ru.raceStats.timeLeadingSeconds), seed: config.scenario.seed, configurationHash: stateHash(config), tuningHash: stateHash(config.content.tuningProfiles.find(p => p.id === config.scenario.tuningProfileId)), finalHash: engine.latest().stateHash, terminal: state.phase, outcome: result?.outcome ?? 'missing_result', ticks: state.tick, entrants: units.length, finished: units.filter(ru => ru.status === 'finished').length, finishRate: units.filter(ru => ru.status === 'finished').length / units.length,
        dnfReasons: reasons, statuses, lapTimes, winnerIds: result?.winnerIds ?? [], overtakesObserved, attacks: sum(ru => ru.combatStats.attempts), hits: sum(ru => ru.combatStats.hits), ramAttempts: sum(ru => ru.combatStats.ramAttempts), collisions: sum(ru => ru.environmentStats.collisions) / 2, fatalities: sum(ru => [ru.driver, ...ru.beasts].filter(c => c.dead).length), injuries: sum(ru => [ru.driver, ...ru.beasts].reduce((sum, c) => sum + c.injuries.length, 0)), destroyed: units.filter(ru => ru.chariot.destroyed).length,
        averageFatigue: samples ? sum(ru => ru.environmentStats.fatigueTotal) / samples : 0, maxFatigue: Math.max(0, ...units.map(ru => ru.environmentStats.maxFatigue)), blockedTransitions: sum(ru => ru.blockedTransitions), externalEvents: state.environment.schedule.filter(e => e.source === 'external').length, activatedEvents: state.environment.activatedEvents, signsUsed: sum(ru => config.scenario.rules.maxSignOpportunities - ru.signOpportunitiesRemaining), laneSeconds, aiModes, warnings,
        failure: state.phase === 'error' ? { message: engine.latest().diagnostics.at(-1)?.message ?? 'Simulation error', diagnostic: JSON.parse(engine.exportBundle()) } : null };
    },
  };
}
export function runMeasuredRace(scenario: unknown, content: unknown): RunSummary {
  const engine = createRaceEngine(scenario, content); const metrics = createMetrics(engine.initialConfiguration); metrics.append(engine.latest());
  while (!['complete','error'].includes(engine.snapshot().phase)) metrics.append(engine.step());
  return metrics.finish(engine);
}
export function percentile(values: readonly number[], quantile: number): number | null {
  if (!values.length) return null; const sorted = [...values].sort((a,b) => a-b); const index = (sorted.length - 1) * quantile; const lo = Math.floor(index); return sorted[lo]! + (sorted[Math.ceil(index)]! - sorted[lo]!) * (index - lo);
}
export function aggregate(runs: readonly RunSummary[]) {
  const reasons: Record<string, number> = {}; const statuses: Record<string, number> = {}; const warnings: Record<string, number> = {}; const aiModes: Record<string, number> = {}; const laneSeconds: Record<string, number> = {};
  for (const run of runs) for (const [source, destination] of [[run.dnfReasons,reasons],[run.statuses,statuses],[run.warnings,warnings],[run.aiModes,aiModes],[run.laneSeconds,laneSeconds]] as const) for (const [key,value] of Object.entries(source)) add(destination,key,value);
  const sum = (fn: (run: RunSummary) => number) => runs.reduce((sum,run) => sum+fn(run),0); const laps = runs.flatMap(run => run.lapTimes);
  const perRu: Record<string, { races: number; finished: number; overtakes: number; timeLeadingSeconds: number; lateralChanges: number; attacks: number; hits: number; damageDealt: number; damageReceived: number; incidents: number; penalties: number; signsQueued: number; signsActivated: number; ramAttempts: number; incidentalContacts: number; collisionDamage: number; blockedTransitions: number; completedLaps: number; finishTimes: number[]; dnfReasons: Record<string,number>; fatigueTotal: number; fatigueSamples: number; meanFatigue: number; maxFatigue: number; signsUsed: number; signsCancelled: number; signsReplacements: number; signsLowered: number; fatalities: number; injuries: number; destroyed: number; componentConditions: Record<string,number> }> = {};
  for (const run of runs) for (const ru of run.perRu) {
    const row=perRu[ru.ruId]??={races:0,finished:0,overtakes:0,timeLeadingSeconds:0,lateralChanges:0,attacks:0,hits:0,damageDealt:0,damageReceived:0,incidents:0,penalties:0,signsQueued:0,signsActivated:0,ramAttempts:0,incidentalContacts:0,collisionDamage:0,blockedTransitions:0,completedLaps:0,finishTimes:[],dnfReasons:{},fatigueTotal:0,fatigueSamples:0,meanFatigue:0,maxFatigue:0,signsUsed:0,signsCancelled:0,signsReplacements:0,signsLowered:0,fatalities:0,injuries:0,destroyed:0,componentConditions:{}};
    row.races++;row.finished+=Number(ru.status==='finished');row.overtakes+=ru.stats.overtakes;row.timeLeadingSeconds+=ru.stats.timeLeadingSeconds;row.lateralChanges+=ru.stats.lateralChanges;row.attacks+=ru.stats.attempts;row.hits+=ru.stats.hits;row.damageDealt+=ru.stats.damageDealt;row.damageReceived+=ru.stats.damageReceived;row.incidents+=ru.stats.incidents;row.penalties+=ru.stats.penalties;row.signsQueued+=ru.stats.signUsage.queued;row.signsActivated+=ru.stats.signUsage.activated;
    row.ramAttempts+=ru.stats.ramAttempts;row.incidentalContacts+=ru.stats.collisions;row.collisionDamage+=ru.stats.collisionDamage;row.blockedTransitions+=ru.stats.blockedTransitions;row.completedLaps+=ru.completedLaps;
    if(ru.finishTimeSeconds!==null)row.finishTimes.push(ru.finishTimeSeconds);if(ru.status!=='finished')add(row.dnfReasons,ru.reason??ru.status);
    row.fatigueTotal+=ru.stats.fatigueTotal;row.fatigueSamples+=ru.stats.fatigueSamples;row.maxFatigue=Math.max(row.maxFatigue,ru.stats.maxFatigue);row.signsUsed+=ru.stats.signsUsed;row.signsCancelled+=ru.stats.signUsage.cancelled;row.signsReplacements+=ru.stats.signUsage.replacements;row.signsLowered+=ru.stats.signUsage.lowered;
    for(const component of ru.components){row.fatalities+=Number(component.dead);row.injuries+=component.injuries.length;row.destroyed+=Number(component.destroyed);add(row.componentConditions,`${component.kind}:${component.band}`);}
  }
  for(const row of Object.values(perRu))row.meanFatigue=row.fatigueSamples?row.fatigueTotal/row.fatigueSamples:0;
  return { unavailableStatistics: [...new Set(runs.flatMap(run=>run.unavailableStatistics ?? []))], perRu, races: runs.length, errors: runs.filter(run => run.failure).length, entrants: sum(run => run.entrants), finished: sum(run => run.finished), finishRate: sum(run => run.entrants) ? sum(run => run.finished) / sum(run => run.entrants) : 0, dnfReasons: reasons, statuses, warnings, aiModes, laneSeconds,
    lapTimes: { samples: laps.length, p10: percentile(laps,.1), median: percentile(laps,.5), p90: percentile(laps,.9) },
    totals: { overtakes: sum(r=>r.overtakes), timeLeadingSeconds: sum(r=>r.timeLeadingSeconds), overtakesObserved: sum(r=>r.overtakesObserved), attacks: sum(r=>r.attacks), hits: sum(r=>r.hits), ramAttempts: sum(r=>r.ramAttempts), collisions: sum(r=>r.collisions), fatalities: sum(r=>r.fatalities), injuries: sum(r=>r.injuries), destroyed: sum(r=>r.destroyed), blockedTransitions: sum(r=>r.blockedTransitions), externalEvents: sum(r=>r.externalEvents), activatedEvents: sum(r=>r.activatedEvents), signsUsed: sum(r=>r.signsUsed) },
    meanRunFatigue: runs.length ? sum(r=>r.averageFatigue) / runs.length : 0, maxFatigue: Math.max(0,...runs.map(r=>r.maxFatigue)), finishRatePerRace: { p10: percentile(runs.map(r=>r.finishRate),.1), median: percentile(runs.map(r=>r.finishRate),.5), p90: percentile(runs.map(r=>r.finishRate),.9) } };
}
/** Exact paired seeds; distribution statistics describe this sample, not significance. */
export function compareBatches(left: readonly RunSummary[], right: readonly RunSummary[]) {
  if (left.length !== right.length || left.some((run,index) => run.seed !== right[index]?.seed)) throw new Error('Paired reports require the same ordered seeds');
  const deltas = left.map((run,index) => ({ seed: run.seed, finishRate: right[index]!.finishRate-run.finishRate, fatalities: right[index]!.fatalities-run.fatalities, attacks: right[index]!.attacks-run.attacks, averageFatigue: right[index]!.averageFatigue-run.averageFatigue, ticks: right[index]!.ticks-run.ticks }));
  return { pairs: deltas.length, deltas, finishRateDelta: { p10: percentile(deltas.map(d=>d.finishRate),.1), median: percentile(deltas.map(d=>d.finishRate),.5), p90: percentile(deltas.map(d=>d.finishRate),.9) }, note: 'Descriptive paired sample; no significance or causal isolation claim. Different configurations can consume RNG differently.' };
}
export function reportCsv(runs: readonly RunSummary[]): string {
  const fields = ['competitionStyle','unavailableStatistics','overtakes','timeLeadingSeconds','perRu','seed','configurationHash','tuningHash','finalHash','terminal','ticks','entrants','finished','finishRate','overtakesObserved','attacks','hits','ramAttempts','collisions','fatalities','injuries','destroyed','averageFatigue','maxFatigue','blockedTransitions','externalEvents','activatedEvents','signsUsed','dnfReasons','lapTimes','laneSeconds','aiModes'] as const;
  const cell = (value: unknown) => { let text = typeof value === 'object' ? JSON.stringify(value) : String(value); if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`; return `"${text.replaceAll('"','""')}"`; };
  return [fields.join(','), ...runs.map(run=>fields.map(key=>cell(run[key])).join(','))].join('\n')+'\n';
}
