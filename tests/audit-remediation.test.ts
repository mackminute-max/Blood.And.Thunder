import { expect, it } from 'vitest';
import { fixture } from './setup-fixture.ts';
import { createRaceEngine } from '../src/simulation/core/race-engine.ts';
import { createMovementEngine } from '../src/simulation/core/movement-engine.ts';
import { copyJson } from '../src/shared/immutable.ts';
import { importDiagnostic, auditDiagnostic, compareDiagnostics } from '../src/diagnostics/compare.ts';
import { createRecording, filterLogs } from '../src/diagnostics/recording.ts';
import { chooseIntents } from '../src/simulation/ai/driver.ts';
import { advanceEnvironment, markDisabled } from '../src/simulation/environment/lifecycle.ts';
import { deriveStats } from '../src/simulation/entities/derive.ts';
import { weatherFactors } from '../src/simulation/environment/weather.ts';
import { signExposureForTick } from '../src/simulation/core/sign-exposure.ts';
import { diagnosticBuffer, traceDiagnostic } from '../src/simulation/core/diagnostics.ts';
import { createCommentary } from '../src/presentation/commentary/generator.ts';
import { COMMENTARY } from '../src/presentation/commentary/settings.ts';
import { resolveCombatPhase } from '../src/simulation/combat/resolve.ts';
import type { MovementEventInput } from '../src/contracts/movement.ts';
import { validateSetup } from '../src/configuration/validate.ts';
import { migrateV02Configuration } from '../src/persistence/migrate-v02.ts';
import { createMetrics, aggregate, reportCsv } from '../src/diagnostics/batch.ts';
import { campaignHandoff } from '../src/contracts/extensions.ts';
function engine() { const f = fixture(); f.scenario.rules.maxTicks = 4; return createRaceEngine(f.scenario, f.content); }
it('rejects diagnostic-only, queue and last-valid tampering and absent endpoint evidence', () => {
    const e = engine();
    e.step();
    const original = JSON.parse(e.exportBundle());
    for (const change of [(raw: typeof original) => { raw.latestTick.diagnostics = []; }, (raw: typeof original) => { raw.commandQueue = { pendingCount: 999 }; }, (raw: typeof original) => { raw.lastValidState = { fabricated: true }; }, (raw: typeof original) => { delete raw.latestTick.events; }]) {
        const raw = copyJson(original);
        change(raw);
        const input = importDiagnostic(JSON.stringify(raw));
        expect(auditDiagnostic(input).valid).toBe(false);
        expect(compareDiagnostics(input, input).identical).toBe(false);
    }
});
it('verifies retained records and sampled history against replay, including metadata', () => {
    const e = engine();
    const recording = createRecording(2, 20, 2);
    recording.append(e.latest());
    for (let i = 0; i < 4; i++)
        recording.append(e.step());
    const raw = { ...JSON.parse(e.exportBundle()), developerRecording: { formatVersion: 'a4-1', ...recording.summary(), frames: recording.frames(), records: recording.rows() } };
    expect(auditDiagnostic(importDiagnostic(JSON.stringify(raw)))).toMatchObject({ valid: true, matchesRecording: true });
    const altered = copyJson(raw);
    altered.developerRecording.records[0]!.message = 'fabricated';
    expect(auditDiagnostic(importDiagnostic(JSON.stringify(altered))).matchesRecording).toBe(false);
});
it('provides a factual activation notification even during repeat/cap suppression', () => {
    const e = engine();
    const radio = createCommentary(e.initialConfiguration, { ...COMMENTARY, maxRoutinePerTick: 0 });
    for (const tick of [1, 2])
        radio.append(tick, [{ type: 'sign_activated', id: `${tick}:1:0`, tick, substep: 1, ruId: 'ru-player', fraction: .5, details: { newValue: 'conserve' } }]);
    expect(radio.feed().map(call => call.type)).toEqual(['sign_activated', 'sign_activated']);
});
it('marks penalties unassessed instead of presenting zero as verified officiating', () => {
    const e = engine();
    e.runUntilComplete();
    expect(e.result()!.unavailableStatistics.some(s => s.startsWith('penalties:'))).toBe(true);
    expect(campaignHandoff(e.result()!).result).toEqual(e.result());
    const summary=createMetrics(e.initialConfiguration).finish(e);expect(aggregate([summary]).unavailableStatistics[0]).toMatch(/not assessed/);expect(reportCsv([summary])).toMatch(/not assessed/);
});
it.each(['immediate', 'delayed', 'persistent'] as const)('implements explicit %s wreck semantics with bounded race termination', mode => {
    const f = fixture();
    f.scenario.rules.wreckMode = mode;
    f.scenario.rules.disabledRemovalTicks = 0;
    f.scenario.rules.maxTicks = 4;
    const e = createRaceEngine(f.scenario, f.content);
    const state = copyJson(e.snapshot());
    const ru = state.ruStates['ru-iron']!;
    ru.status = 'disabled';
    ru.chariot.health = 0;
    ru.chariot.band = 'disabled';
    markDisabled(state, 0, e.initialConfiguration, () => { });
    advanceEnvironment(e.initialConfiguration, state, 1, () => { }, []);
    expect(ru.wreckRemoved).toBe(mode !== 'persistent');
    const cart = f.content.chariots.find(c => c.id === ru.chariot.id)!;
    cart.currentHealth = 0;
    const run = createRaceEngine(f.scenario, f.content);
    run.runUntilComplete();
    expect(run.snapshot().phase).toBe('complete');
    expect(run.snapshot().ruStates[ru.id]!.wreckRemoved).toBe(mode !== 'persistent');
});
it('removes contradicted visible hazard memories but keeps unobserved last-seen hazards', () => {
    const e = engine();
    const state = copyJson(e.snapshot());
    const ru = state.ruStates['ru-player']!;
    const hazard = { id: 'seen', type: 'debris_spawn' as const, tile: { segmentId: 'seg-01', lane: 0 }, createdAt: 0, expiresAt: 30, direction: 1, source: 'external' as const };
    state.hazards = [hazard];
    chooseIntents(e.initialConfiguration, state, 1, () => { });
    expect(ru.aiMemory.hazards).toHaveLength(1);
    state.hazards = [];
    chooseIntents(e.initialConfiguration, state, 2, () => { });
    expect(ru.aiMemory.hazards).toHaveLength(0);
    ru.aiMemory.hazards = [{ hazard: { ...hazard, tile: { segmentId: 'seg-20', lane: 0 } }, lastSeen: 2 }];
    chooseIntents(e.initialConfiguration, state, 3, () => { });
    expect(ru.aiMemory.hazards).toHaveLength(1);
});
it('exposes final-lap and cutoff context as utility contributions without revealing hidden opponents', () => {
    const e = engine();
    const state = copyJson(e.snapshot());
    const ru = state.ruStates['ru-player']!;
    ru.completedLaps = e.initialConfiguration.scenario.rules.laps - 1;
    state.elapsedRaceTicks = 10;
    state.firstFinisherRaceTick = 1;
    chooseIntents(e.initialConfiguration, state, 10, () => { });
    expect(ru.aiDecision!.raceContext.finalLap).toBe(true);
    expect(ru.aiDecision!.candidates.find(c => c.mode === 'push')!.factors.raceContext).toBeGreaterThan(0);
});
it('diagnostic level and sampling cannot alter authoritative state/events or RNG', () => {
    const f = fixture();
    f.scenario.rules.maxTicks = 3;
    const a = createRaceEngine(f.scenario, f.content);
    f.scenario.diagnostics = { level: 'error', traceEveryTicks: 2, snapshotEveryTicks: 2 };
    const b = createRaceEngine(f.scenario, f.content);
    for (let i = 0; i < 3; i++) {
        const left = a.step();
        const right = b.step();
        expect(right.state).toEqual(left.state);
        expect(right.events).toEqual(left.events);
        expect(right.diagnostics).toEqual([]);
    }
    let built = false;
    traceDiagnostic(diagnosticBuffer(f.scenario.diagnostics, 1), () => { built = true; throw new Error('must not build'); });
    expect(built).toBe(false);
});
it('categorizes physical contact explicitly for movement and target filters', () => {
    const e = engine();
    const recording = createRecording();
    recording.append({ ...e.latest(), events: [{ id: '1:1:0', tick: 1, substep: 1, type: 'contact', ruId: 'ru-player', details: { targetId: 'ru-iron' } }] });
    expect(filterLogs(recording.rows(), { subsystem: 'movement', ruId: 'ru-iron', type: 'contact' })).toHaveLength(1);
});
it('applies configurable fixed weather dimensions and crowd performance while defaults are neutral', () => {
    const f = fixture();
    const a = createRaceEngine(f.scenario, f.content);
    const base = a.snapshot().ruStates['ru-player']!.derived;
    const weather = f.content.weather.find(w => w.id === f.scenario.weatherId)!;
    weather.windMps = 20;
    weather.temperatureC = 40;
    weather.precipitation = 1;
    weather.intensity = 1;
    f.content.tuningProfiles[0]!.environment.crowd.morale = 1;
    const b = createRaceEngine(f.scenario, f.content);
    const result = b.snapshot().ruStates['ru-player']!.derived;
    expect(weatherFactors(b.initialConfiguration).fatigue).toBeGreaterThan(weatherFactors(a.initialConfiguration).fatigue);
    expect(result.breakdown.traction).toBeLessThan(base.breakdown.traction!);
    expect(result.maxSpeedMps).toBeGreaterThan(base.maxSpeedMps);
    expect(result.breakdown.crowdFactor).toBe(1.02);
});
it('equipment modifiers apply exactly once per provisioned ID and before explicit overrides', () => {
    const f = fixture();
    const entry = f.scenario.entries.find(e => e.id === 'ru-player')!;
    const item = f.content.weapons.find(w => entry.weaponIds.includes(w.id))!;
    expect(item).toBeDefined();
    const a = createRaceEngine(f.scenario, f.content);
    item.statModifiers.maxSpeedMps = 2;
    item.statModifiers.handling = 3;
    const b = createRaceEngine(f.scenario, f.content);
    const ru = copyJson(b.snapshot().ruStates['ru-player']!);
    expect(ru.derived.maxSpeedMps).toBeCloseTo(a.snapshot().ruStates['ru-player']!.derived.maxSpeedMps + 2);
    expect(ru.derived.breakdown['equipment.maxSpeedMps']).toBe(2);
    ru.derivedOverrides.maxSpeedMps = 7;
    expect(deriveStats(b.initialConfiguration, ru).maxSpeedMps).toBe(7);
});
it('integrates Push Hard fatigue only over its active fractional intervals', () => {
    const exposure = signExposureForTick({ a: { activeSignId: null } }, 1.2);
    exposure.crossing('a', .75, 'push-hard');
    expect(exposure.values().get('a')).toBeCloseTo(1.05);
    const replacement = signExposureForTick({ a: { activeSignId: 'push-hard' } }, 1.2);
    replacement.crossing('a', .25, 'conserve');
    expect(replacement.values().get('a')).toBeCloseTo(1.05);
});
it('reports actual post-durability clipped damage across simultaneous attacks and truthful radio', () => {
    const f = fixture();
    const e = createMovementEngine(f.scenario, f.content);
    const state = copyJson(e.snapshot());
    const attacker = state.ruStates['ru-player']!;
    const target = state.ruStates['ru-iron']!;
    target.tile = { segmentId: attacker.tile.segmentId, lane: attacker.tile.lane + 1 };
    target.chariot.health = 1;
    target.chariot.band = 'critical';
    const weapon = f.content.weapons.find(w => w.channel === 'driver' && w.rangeMode === 'sameSegmentAdjacentLane')!;
    expect(weapon).toBeDefined();
    weapon.minDamage = 1000;
    weapon.maxDamage = 1000;
    weapon.accuracyBase = 1;
    weapon.eligibleTargets = ['chariot'];
    weapon.targetWeights = { chariot: 1, driver: 0, beast: 0 };
    f.scenario.entries.find(x => x.id === attacker.id)!.weaponIds = [weapon.id];
    f.content.tuningProfiles[0]!.combat.hitMin = 1;
    f.content.tuningProfiles[0]!.combat.hitMax = 1;
    const config = validateSetup(f.scenario, f.content);
    const events: MovementEventInput[] = [];
    resolveCombatPhase(config, state, [{ ruId: attacker.id, targetRuId: target.id, weaponId: weapon.id }], new Set(), 'postMove', event => events.push(event), []);
    const hit = events.find(event => event.type === 'attack_hit');
    expect(hit?.type).toBe('attack_hit');
    if (hit?.type !== 'attack_hit')
        throw new Error('Expected hit');
    expect(hit.details.amount).toBe(1);
    expect(hit.details.nominalDamage).toBeGreaterThan(1);
    expect(state.ruStates[attacker.id]!.combatStats.damageDealt).toBe(1);
    const radio = createCommentary(config);
    radio.append(1, events.map((event, index) => ({ ...event, id: `1:0:${index}`, tick: 1, substep: 0 })));
    expect(radio.feed().find(call => call.type === 'attack_hit')!.text).toContain('1 damage');
});
it('bounds operational race horizons and roster/track dimensions at validation', () => {
    const f = fixture();
    f.scenario.rules.maxTicks = 100001;
    expect(() => validateSetup(f.scenario, f.content)).toThrow();
});
it('explicitly migrates 0.8 configurations and never relabels historical replay captures', () => {
    const f = fixture();
    const legacy = { kind: 'blood-thunder-configuration-a4-1', name: 'v03', mode: 'race', ...f, scenario: { ...f.scenario, simulationVersion: '0.8.0' } };
    expect(migrateV02Configuration(legacy).scenario.simulationVersion).toBe('0.9.0');
    expect(legacy.scenario.simulationVersion).toBe('0.8.0');
});
it.each(['conserve', 'push-hard'] as const)('stronger %s changes actual target pace using the shipped sign catalog', sign => {
    const targets: number[] = [];
    for (const strength of [1, 2]) {
        const f = fixture();
        f.content.tuningProfiles[0]!.ai.signInfluence.globalStrength = strength;
        const e = createRaceEngine(f.scenario, f.content);
        const state = copyJson(e.snapshot());
        state.ruStates['ru-player']!.activeSignId = sign;
        chooseIntents(e.initialConfiguration, state, 1, () => { });
        targets.push(state.ruStates['ru-player']!.targetSpeedMps);
    }
    expect(Math.abs(targets[1]! - targets[0]!)).toBeGreaterThan(.01);
    if (sign === 'conserve')
        expect(targets[1]).toBeLessThan(targets[0]!);
    else
        expect(targets[1]).toBeGreaterThan(targets[0]!);
});
it('higher Attack and Defend influence crosses legal decision boundaries without modifying sign catalog weights',async()=>{
    const {planCombat}=await import('../src/simulation/combat/planning.ts');
    const observed:{attack:number;guard:boolean}[]=[];
    for(const strength of [1,2]) {
        const f=fixture();const player=f.scenario.entries.find(e=>e.id==='ru-player')!;
        const driver=f.content.drivers.find(d=>d.id===player.driverId)!;driver.personality.aggression=0;driver.personality.riskTolerance=100;driver.personality.discipline=0;
        f.content.tuningProfiles[0]!.ai.signInfluence.globalStrength=strength;
        const e=createRaceEngine({...f.scenario,controller:'ai'},f.content);const attackState=copyJson(e.snapshot());const ru=attackState.ruStates[player.id]!;ru.activeSignId='attack';ru.driver.health=1;ru.driver.band='critical';ru.chariot.health=1;ru.chariot.band='critical';
        planCombat(e.initialConfiguration,attackState,1,()=>{},[]);
        const guardState=copyJson(e.snapshot());guardState.ruStates[player.id]!.activeSignId='defend-position';planCombat(e.initialConfiguration,guardState,1,()=>{},[]);
        observed.push({attack:ru.combatDecision!.selected.length,guard:guardState.ruStates[player.id]!.combatDecision!.guard});
    }
    expect(observed[1]!.attack).toBeGreaterThan(observed[0]!.attack);
    expect(observed.map(row=>row.guard)).toEqual([false,true]);
});
