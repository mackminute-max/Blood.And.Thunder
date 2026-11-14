import { diagnosticBuffer } from './diagnostics.ts';
import { traceDiagnostic } from './diagnostics.ts';
import { signExposureForTick } from './sign-exposure.ts';
import { activatePendingSign } from './signs.ts';
import { initializeEnvironment, advanceEnvironment, markDisabled, occupiesRu, assertEnvironmentState } from '../environment/lifecycle.ts';
import { applyFatigue } from '../environment/fatigue.ts';
import { advanceCooldowns, resolveCombatPhase, assertCombatState } from '../combat/resolve.ts';
import { planCombat } from '../combat/planning.ts';
import { createCommandQueue } from './commands.ts';
import { chooseIntents, recordAiOutcomes } from '../ai/driver.ts';
import { initializeRace } from './initialize.ts';
import { deriveStats } from '../entities/derive.ts';
import { moveTick } from '../movement/schedule.ts';
import { copyJson, freezeDeep } from '../../shared/immutable.ts';
import { stateHash } from '../../diagnostics/state-hash.ts';
import type { MovementState, TickOutput, MovementDiagnostic, MovementEvent, MovementEventInput } from '../../contracts/movement.ts';

export function assertMovementState(state: MovementState): void {
  const occupied = new Set<string>();
  for (const ru of Object.values(state.ruStates)) {
    const key = `${ru.tile.segmentId}:${ru.tile.lane}`;
    if (occupiesRu(ru) && occupied.has(key)) throw new Error(`Duplicate occupancy at ${key}`);
    if (occupiesRu(ru)) occupied.add(key);
    if (ru.progressInSegment < 0 || ru.progressInSegment >= 1 || ru.speedMps < 0) throw new Error(`Invalid movement state for ${ru.id}`);
  }
  stateHash(state); // Also rejects nonfinite/non-JSON authoritative values.
}
/** Raw movement/AI harness; official lap/results rules live in race-engine. */
export function createMovementEngine(scenarioInput: unknown, contentInput: unknown) {
  const initialized = initializeRace(scenarioInput, contentInput);
  const config = initialized.initialConfiguration;
  const state: MovementState = { ...copyJson(initialized.snapshot()), ruStates: {}, environment: { expectedRaceTicks: 0, schedule: [], activatedEvents: 0, skippedEvents: 0 } };
  for (const ru of Object.values(initialized.snapshot().ruStates)) state.ruStates[ru.id] = { ...copyJson(ru), disabledAtMovementTick: ru.status === 'disabled' ? 0 : null, wreckRemoved: false, environmentStats: { collisions: 0, collisionDamage: 0, fatigueSamples: 0, fatigueTotal: 0, maxFatigue: 0 }, derivedOverrides: {}, aiMemory: { hazards: [], targetLane: null, commitmentUntil: 0, reevaluate: true, lastFailed: false }, aiDecision: null, combatDecision: null, actionCooldowns: {}, combatStats: { attempts: 0, hits: 0, damageDealt: 0, damageReceived: 0, ramAttempts: 0, defenses: 0 }, derived: deriveStats(config, ru) };
  state.environment = initializeEnvironment(config, state);
  assertMovementState(state);
  let current = freezeDeep(state);
  let last: TickOutput = freezeDeep({ state: current, events: initialized.events, diagnostics: [], stateHash: stateHash(current) });
  let lastValid = current;
  const commands = createCommandQueue(config); commands.initialize(current);
  return Object.freeze({
    initialConfiguration: config,
    initializationEvents: initialized.events,
    snapshot: () => current,
    submit: (input: unknown, context = { paused: false }) => commands.submit(input, current, context.paused),
    commandJournal: () => commands.journal(),
    latest: () => last,
    exportBundle: () => JSON.stringify({ kind: 'a2-movement-diagnostic', commandJournal: commands.journal(), commandQueue: commands.summary(), initialConfiguration: config, state: current, lastValidState: lastValid, latestTick: last }, null, 2),
    step(): TickOutput {
      if (current.phase === 'halted' || current.phase === 'error') throw new Error(`Cannot step ${current.phase} movement harness; reinitialize`);
      const next = copyJson(current) as MovementState;
      next.tick++; next.phase = 'running';
      const diagnostics: MovementDiagnostic[] = diagnosticBuffer(config.scenario.diagnostics, next.tick);
      const events: MovementEvent[] = [];
      const emit = (event: MovementEventInput) => events.push({ ...event, id: '', tick: next.tick, substep: 0 });
      try {
        commands.apply(next, emit);
        if(current.tick===0) for(const ru of Object.values(next.ruStates)) activatePendingSign(ru,next.tick,0,'starting_signal',emit);
        advanceCooldowns(next);
        advanceEnvironment(config, next, next.tick, emit, diagnostics);
        const signExposure = signExposureForTick(next.ruStates, config.content.tuningProfiles.find(t=>t.id===config.scenario.tuningProfileId)!.ai.pushFatigueMultiplier);
        const startSpeeds = new Map(Object.values(next.ruStates).filter(ru => ru.status === 'active').map(ru => [ru.id, ru.speedMps]));
        for (const ru of Object.values(next.ruStates)) {
          ru.derived = deriveStats(config, ru, next.hazards);
          ru.targetSpeedMps = ru.derived.maxSpeedMps * config.scenario.targetSpeedRatios[ru.id]!;
          traceDiagnostic(diagnostics, () => ({ tick: next.tick, substep: 0, level: 'trace', subsystem: 'stats', ruId: ru.id, message: 'Derived tick-start RU performance', details: { ...ru.derived } }));
        }
        const plans = config.scenario.controller === 'ai' ? chooseIntents(config, next, next.tick, emit) : undefined;
        const combat = planCombat(config, next, next.tick, emit, diagnostics);
        resolveCombatPhase(config, next, combat.plans, combat.guards, 'preMove', emit, diagnostics);
        const movement = moveTick(config, next, { onLineCrossing: (event,emit) => { const ru = next.ruStates[event.ruId]!; signExposure.crossing(ru.id,event.fraction,ru.pendingSign?.signId ?? ru.activeSignId); activatePendingSign(ru,next.tick,event.fraction,'line_crossing',emit); }, ...(plans ? { lanePlans: plans } : {}), afterLateral: (contactEmit, trace) => resolveCombatPhase(config, next, combat.plans, combat.guards, 'contact', contactEmit, trace) });
        for (const ru of Object.values(next.ruStates)) if (ru.aiDecision?.movementTick === next.tick) traceDiagnostic(diagnostics, () => ({ tick: next.tick, substep: 0, level: 'trace', subsystem: 'ai', ruId: ru.id, message: 'Perception, candidate utility and chosen intent', details: { decision: ru.aiDecision } }));
        events.push(...movement.events);
        const postSubstep = Math.max(0, ...movement.events.map(event => event.substep)) + 1;
        resolveCombatPhase(config, next, combat.plans, combat.guards, 'postMove', event => events.push({ ...event, id: '', tick: next.tick, substep: postSubstep }), diagnostics, postSubstep);
        const lateEmit = (event: MovementEventInput) => events.push({ ...event, id: '', tick: next.tick, substep: postSubstep });
        applyFatigue(config, next, startSpeeds, lateEmit, signExposure.values()); markDisabled(next, next.tick, config, lateEmit);
        if (config.scenario.controller === 'ai') recordAiOutcomes(next, movement.events, next.tick, event => events.push({ ...event, id: '', tick: next.tick, substep: Math.max(0, ...movement.events.map(event => event.substep)) + 1 }));
        const sequences = new Map<number, number>();
        for (const event of events) { const sequence = sequences.get(event.substep) ?? 0; event.id = `${next.tick}:${event.substep}:${sequence}`; sequences.set(event.substep, sequence + 1); }
        diagnostics.push(...movement.diagnostics);
        if (next.tick >= config.scenario.rules.maxTicks) {
          next.phase = 'halted'; next.haltReason = 'tick_limit';
          diagnostics.push({ tick: next.tick, substep: 0, level: 'warning', subsystem: 'movement', message: 'Movement harness tick limit reached; race classification is not implemented', details: {} });
        }
        assertEnvironmentState(next);
        assertCombatState(config, next);
        assertMovementState(next);
        current = freezeDeep(next); lastValid = current;
        last = freezeDeep({ state: current, events, diagnostics, stateHash: stateHash(current) });
      } catch (error) {
        current = freezeDeep({ ...copyJson(current), phase: 'error' as const, haltReason: 'invariant_violation' as const });
        diagnostics.push({ tick: next.tick, substep: 0, level: 'error', subsystem: 'invariants', message: error instanceof Error ? error.message : 'Movement failed', details: { attemptedTick: next.tick } });
        last = freezeDeep({ state: current, events: [{ id: `${next.tick}:0:0`, tick: next.tick, substep: 0, type: 'invariant_violation' as const, message: diagnostics.at(-1)!.message }], diagnostics, stateHash: stateHash(current) });
      }
      return last;
    },
  });
}
