import type { DeepReadonly, InitialConfiguration } from '../contracts/initialization.ts';
import type { RaceState, RaceTickOutput } from '../contracts/race.ts';
import { createRaceEngine } from '../simulation/core/race-engine.ts';
import { stateHash } from './state-hash.ts';
export const REPORT_VERSION = 'blood-thunder-batch-e1';
export interface RunSummary {
  competitionStyle: string; perRu: readonly DeepReadonly<import('../contracts/race.ts').RaceClassification>[]; overtakes: number; timeLeadingSeconds: number;
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
      return { competitionStyle: config.scenario.rules.competitionStyle, perRu: result?.classification ?? [], overtakes: sum(ru=>ru.raceStats.overtakes), timeLeadingSeconds: sum(ru=>ru.raceStats.timeLeadingSeconds), seed: config.scenario.seed, configurationHash: stateHash(config), tuningHash: stateHash(config.content.tuningProfiles.find(p => p.id === config.scenario.tuningProfileId)), finalHash: engine.latest().stateHash, terminal: state.phase, outcome: result?.outcome ?? 'missing_result', ticks: state.tick, entrants: units.length, finished: units.filter(ru => ru.status === 'finished').length, finishRate: units.filter(ru => ru.status === 'finished').length / units.length,
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
  return { races: runs.length, errors: runs.filter(run => run.failure).length, entrants: sum(run => run.entrants), finished: sum(run => run.finished), finishRate: sum(run => run.entrants) ? sum(run => run.finished) / sum(run => run.entrants) : 0, dnfReasons: reasons, statuses, warnings, aiModes, laneSeconds,
    lapTimes: { samples: laps.length, p10: percentile(laps,.1), median: percentile(laps,.5), p90: percentile(laps,.9) },
    totals: { overtakesObserved: sum(r=>r.overtakesObserved), attacks: sum(r=>r.attacks), hits: sum(r=>r.hits), ramAttempts: sum(r=>r.ramAttempts), collisions: sum(r=>r.collisions), fatalities: sum(r=>r.fatalities), injuries: sum(r=>r.injuries), destroyed: sum(r=>r.destroyed), blockedTransitions: sum(r=>r.blockedTransitions), externalEvents: sum(r=>r.externalEvents), activatedEvents: sum(r=>r.activatedEvents), signsUsed: sum(r=>r.signsUsed) },
    meanRunFatigue: runs.length ? sum(r=>r.averageFatigue) / runs.length : 0, maxFatigue: Math.max(0,...runs.map(r=>r.maxFatigue)), finishRatePerRace: { p10: percentile(runs.map(r=>r.finishRate),.1), median: percentile(runs.map(r=>r.finishRate),.5), p90: percentile(runs.map(r=>r.finishRate),.9) } };
}
/** Exact paired seeds; distribution statistics describe this sample, not significance. */
export function compareBatches(left: readonly RunSummary[], right: readonly RunSummary[]) {
  if (left.length !== right.length || left.some((run,index) => run.seed !== right[index]?.seed)) throw new Error('Paired reports require the same ordered seeds');
  const deltas = left.map((run,index) => ({ seed: run.seed, finishRate: right[index]!.finishRate-run.finishRate, fatalities: right[index]!.fatalities-run.fatalities, attacks: right[index]!.attacks-run.attacks, averageFatigue: right[index]!.averageFatigue-run.averageFatigue, ticks: right[index]!.ticks-run.ticks }));
  return { pairs: deltas.length, deltas, finishRateDelta: { p10: percentile(deltas.map(d=>d.finishRate),.1), median: percentile(deltas.map(d=>d.finishRate),.5), p90: percentile(deltas.map(d=>d.finishRate),.9) }, note: 'Descriptive paired sample; no significance or causal isolation claim. Different configurations can consume RNG differently.' };
}
export function reportCsv(runs: readonly RunSummary[]): string {
  const fields = ['competitionStyle','overtakes','timeLeadingSeconds','perRu','seed','configurationHash','tuningHash','finalHash','terminal','ticks','entrants','finished','finishRate','overtakesObserved','attacks','hits','ramAttempts','collisions','fatalities','injuries','destroyed','averageFatigue','maxFatigue','blockedTransitions','externalEvents','activatedEvents','signsUsed','dnfReasons','lapTimes','laneSeconds','aiModes'] as const;
  const cell = (value: unknown) => { let text = typeof value === 'object' ? JSON.stringify(value) : String(value); if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`; return `"${text.replaceAll('"','""')}"`; };
  return [fields.join(','), ...runs.map(run=>fields.map(key=>cell(run[key])).join(','))].join('\n')+'\n';
}
