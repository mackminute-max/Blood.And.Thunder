import { diagnosticBuffer } from './diagnostics.ts';
import { traceDiagnostic } from './diagnostics.ts';
import { signExposureForTick } from './sign-exposure.ts';
import { activatePendingSign } from './signs.ts';
import { recordRaceStatistics } from '../rules/statistics.ts';
import { advanceEnvironment, markDisabled, occupiesRu, assertEnvironmentState } from '../environment/lifecycle.ts';
import { applyFatigue } from '../environment/fatigue.ts';
import { advanceCooldowns, resolveCombatPhase, assertCombatState } from '../combat/resolve.ts';
import { planCombat } from '../combat/planning.ts';
import { createCommandQueue } from './commands.ts';
import { chooseIntents, recordAiOutcomes } from '../ai/driver.ts';
import { createMovementEngine } from './movement-engine.ts';
import { deriveStats } from '../entities/derive.ts';
import { moveTick } from '../movement/schedule.ts';
import { copyJson, freezeDeep } from '../../shared/immutable.ts';
import { stateHash } from '../../diagnostics/state-hash.ts';
import { buildResult, rankFinishes, updateStandings } from '../rules/classification.ts';
import type { RaceState, RaceEvent, RaceRuleEvent, RaceTickOutput } from '../../contracts/race.ts';
import type { MovementDiagnostic, MovementEventInput } from '../../contracts/movement.ts';

type RuleInput = Omit<RaceRuleEvent, 'id' | 'tick' | 'substep'>;
export function assertRaceState(state: RaceState): void {
  const occupied = new Set<string>();
  for (const ru of Object.values(state.ruStates)) {
    if (occupiesRu(ru)) {
      const key = `${ru.tile.segmentId}:${ru.tile.lane}`;
      if (occupied.has(key)) throw new Error(`Duplicate race occupancy at ${key}`);
      occupied.add(key);
    }
    if (ru.progressInSegment < 0 || ru.progressInSegment >= 1 || ru.speedMps < 0 || !Number.isSafeInteger(ru.completedLaps) || ru.completedLaps < 0) throw new Error(`Invalid race state for ${ru.id}`);
    const expectedLaps = Math.max(0, ru.startLineCrossings - (ru.initialUnwrappedCoursePosition < 0 ? 1 : 0));
    if (ru.completedLaps !== expectedLaps || ru.hasStartedLap !== (ru.initialUnwrappedCoursePosition === 0 || ru.startLineCrossings > 0)) throw new Error(`Start-line accounting mismatch for ${ru.id}`);
    if (ru.hasStartedLap !== (ru.firstLapStartedAtSeconds !== null)) throw new Error(`Lap-start time mismatch for ${ru.id}`);
    if (ru.normalizedCoursePosition !== ru.initialUnwrappedCoursePosition + ru.acceptedTransitions + ru.progressInSegment) throw new Error(`Course position mismatch for ${ru.id}`);
    if ((ru.status === 'finished') !== (ru.finishTimeSeconds !== null)) throw new Error(`Finish status/time mismatch for ${ru.id}`);
  }
  if (state.finishRecords.length !== new Set(state.finishRecords.map(record => record.ruId)).size) throw new Error('Duplicate finish records');
  if (state.phase === 'complete' && Object.values(state.ruStates).some(ru => ru.status === 'active')) throw new Error('Completed race still has active entrants');
  stateHash(state);
}
/** Circuit lifecycle with approved shared-clock, rear-row start-line accounting. */
export function createRaceEngine(scenarioInput: unknown, contentInput: unknown) {
  const movement = createMovementEngine(scenarioInput, contentInput);
  const config = movement.initialConfiguration;
  const track = config.content.tracks.find(track => track.id === config.scenario.trackId)!;
  const boundary = track.segments.find(segment => segment.startFinishBoundary)!;
  const tuning = config.content.tuningProfiles.find(profile => profile.id === config.scenario.tuningProfileId)!;
  const rules = config.scenario.rules;
  const base = copyJson(movement.snapshot());
  const initial: RaceState = {
    ...base, phase: 'grid', finishRecords: [], ruStates: {}, countdownRemaining: rules.countdownTicks,
    raceStartedTick: null, elapsedRaceTicks: 0, firstFinisherRaceTick: null, progressOrder: {}, standings: [], result: null,
  };
  for (const ru of Object.values(base.ruStates)) {
    const segmentOrder = track.segments.find(segment => segment.id === ru.tile.segmentId)!.order;
    const relativeOrder = (segmentOrder - boundary.order + track.segments.length) % track.segments.length;
    const origin = relativeOrder === 0 ? 0 : relativeOrder - track.segments.length;
    initial.ruStates[ru.id] = {
      ...ru, raceStats: { overtakes: 0, timeLeadingSeconds: 0, penalties: 0, incidents: 0, lateralChanges: 0 }, initialUnwrappedCoursePosition: origin, hasStartedLap: origin === 0,
      firstLapStartedAtSeconds: origin === 0 ? 0 : null,
      startLineCrossings: 0, normalizedCoursePosition: origin, acceptedTransitions: 0, blockedTransitions: 0, finishTimeSeconds: null,
    };
  }
  updateStandings(initial); assertRaceState(initial);
  let current = freezeDeep(initial); let lastValid = current;
  const commands = createCommandQueue(config); commands.initialize(current);
  let latest: RaceTickOutput = freezeDeep({ state: current, events: movement.initializationEvents, diagnostics: [], stateHash: stateHash(current) });
  const step = (): RaceTickOutput => {
    if (current.phase === 'complete' || current.phase === 'error') throw new Error(`Cannot step ${current.phase} race; reinitialize`);
    const next = copyJson(current); next.tick++;
    const events: RaceEvent[] = []; const diagnostics: MovementDiagnostic[] = diagnosticBuffer(config.scenario.diagnostics, next.tick);
    const sequence = new Map<number, number>();
    const emit = <T extends Exclude<RaceEvent, {type: 'race_initialized'}>>(event: T): void => {
      const index = sequence.get(event.substep) ?? 0; sequence.set(event.substep, index + 1);
      events.push({ ...event, id: `${next.tick}:${event.substep}:${index}`, tick: next.tick });
    };
    const ruleEvent = (substep: number, event: RuleInput) => emit({ ...event, id: '', tick: next.tick, substep });
    const controlEvent = (event: MovementEventInput) => emit({ ...event, id: '', tick: next.tick, substep: 0 });
    try {
      commands.apply(next, controlEvent);
      let countdownOnly = false;
      if (next.raceStartedTick === null) {
        if (next.countdownRemaining > 0) {
          next.phase = 'countdown'; next.countdownRemaining--;
          ruleEvent(0, { type: 'race_countdown', ruId: null, timeSeconds: 0, details: { remainingTicks: next.countdownRemaining } });
          countdownOnly = true;
        }
        if (next.countdownRemaining === 0) {
          next.raceStartedTick = countdownOnly ? next.tick : current.tick;
          next.phase = 'running';
          ruleEvent(0, { type: 'race_started', ruId: null, timeSeconds: 0, details: { raceStartedTick: next.raceStartedTick } });
          for(const ru of Object.values(next.ruStates)) activatePendingSign(ru,next.tick,0,'starting_signal',controlEvent);
        }
      }
      if (!countdownOnly) {
        next.elapsedRaceTicks++;
        advanceCooldowns(next);
        advanceEnvironment(config, next, next.elapsedRaceTicks, controlEvent, diagnostics);
        const signExposure = signExposureForTick(next.ruStates, tuning.ai.pushFatigueMultiplier);
        const startSpeeds = new Map(Object.values(next.ruStates).filter(ru => ru.status === 'active').map(ru => [ru.id, ru.speedMps]));
        for (const ru of Object.values(next.ruStates)) {
          if (ru.status !== 'active') continue;
          ru.derived = deriveStats(config, ru, next.hazards);
          if (ru.derived.maxSpeedMps === 0) {
            ru.status = 'retired'; ru.statusReason = 'unable_to_continue'; ru.speedMps = 0; ru.targetSpeedMps = 0;
            ruleEvent(0, { type: 'ru_retired', ruId: ru.id, timeSeconds: (next.elapsedRaceTicks - 1) * tuning.tickDurationSeconds, details: { reason: ru.statusReason } });
          } else ru.targetSpeedMps = ru.derived.maxSpeedMps * config.scenario.targetSpeedRatios[ru.id]!;
          traceDiagnostic(diagnostics, () => ({ tick: next.tick, substep: 0, level: 'trace', subsystem: 'stats', ruId: ru.id, message: 'Derived race tick-start performance', details: { ...ru.derived } }));
        }
        const plans = config.scenario.controller === 'ai' ? chooseIntents(config, next, next.elapsedRaceTicks, controlEvent) : undefined;
        const combat = planCombat(config, next, next.elapsedRaceTicks, controlEvent, diagnostics);
        resolveCombatPhase(config, next, combat.plans, combat.guards, 'preMove', controlEvent, diagnostics);
        const advanced = moveTick(config, next, {
          ...(plans ? { lanePlans: plans } : {}),
          movementTick: next.elapsedRaceTicks,
          afterLateral: (contactEmit, trace) => resolveCombatPhase(config, next, combat.plans, combat.guards, 'contact', contactEmit, trace),
          occupiesTile: id => occupiesRu(next.ruStates[id]!),
          onEvent: event => {
            emit(event);
            if (event.type === 'movement_blocked') next.ruStates[event.ruId]!.blockedTransitions++;
          },
          onTransition: event => {
            const ru = next.ruStates[event.ruId]!; ru.acceptedTransitions++;
            if (!event.crossedStartLine) return;
            signExposure.crossing(ru.id,event.fraction,ru.pendingSign?.signId ?? ru.activeSignId);
            activatePendingSign(ru,next.tick,event.fraction,'line_crossing',activation => emit({...activation,id:'',tick:next.tick,substep:event.substep}));
            ru.startLineCrossings++;
            const timeSeconds = (next.elapsedRaceTicks - 1 + event.fraction) * tuning.tickDurationSeconds;
            if (!ru.hasStartedLap) {
              ru.hasStartedLap = true; ru.firstLapStartedAtSeconds = timeSeconds;
              ruleEvent(event.substep, { type: 'lap_started', ruId: ru.id, timeSeconds, details: { completedLaps: 0, fraction: event.fraction } });
              return;
            }
            ru.completedLaps++;
            ruleEvent(event.substep, { type: 'lap_crossed', ruId: ru.id, timeSeconds, details: { completedLaps: ru.completedLaps, fraction: event.fraction } });
            if (ru.completedLaps === rules.laps) {
              ru.status = 'finished'; ru.statusReason = 'completed_laps'; ru.finishTimeSeconds = timeSeconds;
              ru.speedMps = 0; ru.targetSpeedMps = 0;
              next.finishRecords.push({ ruId: ru.id, finishTimeSeconds: timeSeconds, rank: 0, tiedWith: [] });
              if (next.firstFinisherRaceTick === null) next.firstFinisherRaceTick = next.elapsedRaceTicks;
              ruleEvent(event.substep, { type: 'ru_finished', ruId: ru.id, timeSeconds, details: { completedLaps: ru.completedLaps, fraction: event.fraction } });
            }
          },
        });
        for (const ru of Object.values(next.ruStates)) if (ru.aiDecision?.movementTick === next.elapsedRaceTicks) traceDiagnostic(diagnostics, () => ({ tick: next.tick, substep: 0, level: 'trace', subsystem: 'ai', ruId: ru.id, message: 'Perception, candidate utility and chosen intent', details: { decision: ru.aiDecision } }));
        diagnostics.push(...advanced.diagnostics);
        const postSubstep = Math.max(0, ...advanced.events.map(event => event.substep)) + 1;
        resolveCombatPhase(config, next, combat.plans, combat.guards, 'postMove', event => emit({ ...event, id: '', tick: next.tick, substep: postSubstep }), diagnostics, postSubstep);
        applyFatigue(config, next, startSpeeds, event => emit({ ...event, id: '', tick: next.tick, substep: postSubstep }), signExposure.values()); markDisabled(next, next.elapsedRaceTicks, config, event => emit({ ...event, id: '', tick: next.tick, substep: postSubstep }));
        if (config.scenario.controller === 'ai') recordAiOutcomes(next, advanced.events, next.elapsedRaceTicks, event => emit({ ...event, id: '', tick: next.tick, substep: Math.max(0, ...advanced.events.map(event => event.substep)) + 1 }));
        for (const ru of Object.values(next.ruStates)) ru.normalizedCoursePosition = ru.initialUnwrappedCoursePosition + ru.acceptedTransitions + ru.progressInSegment;
        next.finishRecords = rankFinishes(next.finishRecords, rules.finishTieToleranceSeconds);
        const finalSubstep = Math.max(0, ...events.map(event => event.substep)) + 1;
        for (const ru of Object.values(next.ruStates)) if (ru.status === 'retired' && ru.statusReason === 'deadlock_recovery' && current.ruStates[ru.id]!.status === 'active') ruleEvent(finalSubstep, { type: 'ru_retired', ruId: ru.id, timeSeconds: next.elapsedRaceTicks * tuning.tickDurationSeconds, details: { reason: ru.statusReason } });
        const cutoff = next.firstFinisherRaceTick !== null && next.elapsedRaceTicks >= next.firstFinisherRaceTick + rules.finishCutoffTicks;
        const timeout = next.elapsedRaceTicks >= rules.maxTicks;
        if (cutoff || timeout) for (const ru of Object.values(next.ruStates)) if (ru.status === 'active') {
          ru.status = 'dnf'; ru.statusReason = cutoff ? 'finish_cutoff' : 'race_timeout'; ru.speedMps = 0; ru.targetSpeedMps = 0;
          ruleEvent(finalSubstep, { type: 'ru_dnf', ruId: ru.id, timeSeconds: next.elapsedRaceTicks * tuning.tickDurationSeconds, details: { reason: ru.statusReason } });
        }
        for (const pass of recordRaceStatistics(current, next, events, tuning.tickDurationSeconds)) ruleEvent(finalSubstep, { type: 'ru_overtake', ruId: pass.ruId, timeSeconds: (next.elapsedRaceTicks - 1 + pass.fraction) * tuning.tickDurationSeconds, details: { ...pass } });
        if (Object.values(next.ruStates).every(ru => ru.status !== 'active')) {
          next.phase = 'complete'; next.result = buildResult(config, next, 'classified');
          ruleEvent(finalSubstep, { type: 'race_finished', ruId: null, timeSeconds: next.elapsedRaceTicks * tuning.tickDurationSeconds, details: { winnerIds: next.result.winnerIds } });
        } else if (next.firstFinisherRaceTick !== null) next.phase = 'concluding';
      }
      updateStandings(next);
      traceDiagnostic(diagnostics, () => ({ tick: next.tick, substep: Math.max(0, ...events.map(event => event.substep)) + 1, level: 'trace', subsystem: 'rules', message: 'Applied circuit lifecycle and classification rules', details: { phase: next.phase, rules, elapsedRaceTicks: next.elapsedRaceTicks, firstFinisherRaceTick: next.firstFinisherRaceTick, finishRecords: next.finishRecords, standings: next.standings } }));
      assertEnvironmentState(next);
      assertCombatState(config, next);
      assertRaceState(next);
      current = freezeDeep(next); lastValid = current;
      latest = freezeDeep({ state: current, events, diagnostics, stateHash: stateHash(current) });
    } catch (error) {
      const failed = copyJson(current); failed.phase = 'error';
      for (const ru of Object.values(failed.ruStates)) if (ru.status === 'active') { ru.status = 'dnf'; ru.statusReason = 'simulation_error'; ru.speedMps = 0; ru.targetSpeedMps = 0; }
      failed.result = buildResult(config, failed, 'simulation_error');
      current = freezeDeep(failed);
      const message = error instanceof Error ? error.message : 'Race failed';
      diagnostics.push({ tick: next.tick, substep: 0, level: 'error', subsystem: 'invariants', message, details: { attemptedTick: next.tick } });
      latest = freezeDeep({ state: current, events: [{ id: `${next.tick}:0:0`, tick: next.tick, substep: 0, type: 'invariant_violation' as const, message }], diagnostics, stateHash: stateHash(current) });
    }
    return latest;
  };
  return Object.freeze({
    initialConfiguration: config, initializationEvents: movement.initializationEvents,
    snapshot: () => current,
    submit: (input: unknown, context = { paused: false }) => commands.submit(input, current, context.paused),
    commandJournal: () => commands.journal(), latest: () => latest, step,
    result: () => current.result,
    runUntilComplete: () => {
      while (current.phase !== 'complete' && current.phase !== 'error') step();
      return current.result;
    },
    exportBundle: () => JSON.stringify({ kind: 'a3-race-diagnostic', commandJournal: commands.journal(), commandQueue: commands.summary(), initialConfiguration: config, state: current, lastValidState: lastValid, latestTick: latest }, null, 2),
  });
}
