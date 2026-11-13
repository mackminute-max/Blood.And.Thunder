import { SIMULATION_VERSION, SCHEMA_VERSION } from '../configuration/schemas.ts';
import { z } from 'zod';
import { parseSetupJson } from '../configuration/load.ts';
import { validateSetup } from '../configuration/validate.ts';
import { replayRace, replayMovement } from '../simulation/core/replay.ts';
import { canonicalState, stateHash } from './state-hash.ts';
import type { TickOutput } from '../contracts/movement.ts';
import type { RaceTickOutput } from '../contracts/race.ts';
const schema = z.object({
  kind: z.enum(['a2-movement-diagnostic', 'a3-race-diagnostic']),
  initialConfiguration: z.object({ scenario: z.unknown(), content: z.unknown() }),
  commandJournal: z.array(z.object({ submittedAtTick: z.number().int().nonnegative(), submittedAtPhase: z.enum(['grid','countdown','running','concluding','complete','halted','error']), origin: z.enum(['scripted','live']), paused: z.boolean(), input: z.unknown(), receipt: z.object({ accepted: z.boolean(), reason: z.string(), effectiveTick: z.number().int().nullable() }) })).max(100000),
  state: z.looseObject({ tick: z.number().int().nonnegative(), phase: z.string() }),
  latestTick: z.looseObject({ stateHash: z.string(), events: z.array(z.unknown()).optional() }),
});
export const ANALYSIS_FRAME_LIMIT = 100000;
export function importDiagnostic(source: string) {
  const input = schema.parse(parseSetupJson(source, 'diagnostic'));
  const config = validateSetup(input.initialConfiguration.scenario, input.initialConfiguration.content);
  if (input.state.tick > ANALYSIS_FRAME_LIMIT) throw new Error('Diagnostic exceeds 100000-frame analysis safety limit; use a shorter capture');
  if (input.state.tick > config.scenario.rules.maxTicks + config.scenario.rules.countdownTicks) throw new Error('Diagnostic endpoint exceeds race horizon');
  const phases = input.kind === 'a2-movement-diagnostic' ? ['grid','running','halted','error'] : ['grid','countdown','running','concluding','complete','error'];
  if (!phases.includes(input.state.phase)) throw new Error('Diagnostic phase does not match engine kind');
  if (input.commandJournal.length > config.scenario.rules.maxCommandSubmissions) throw new Error('Diagnostic journal exceeds configured limit');
  return { ...input, initialConfiguration: config };
}
export type Diagnostic = ReturnType<typeof importDiagnostic>;
type Frame = TickOutput | RaceTickOutput;
export interface ChangedPath { path: string; left: unknown; right: unknown }
export function changedPaths(left: unknown, right: unknown, limit = 100): ChangedPath[] {
  const changes: ChangedPath[] = [];
  const visit = (a: unknown, b: unknown, path: string) => {
    if (changes.length >= limit || a === b) return;
    if (a === undefined || b === undefined) { changes.push({ path, left: a ?? null, right: b ?? null }); return; }
    if (canonicalState(a) === canonicalState(b)) return;
    if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
      for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) visit((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], `${path}/${key.replaceAll('~','~0').replaceAll('/','~1')}`);
    } else changes.push({ path: path || '/', left: a, right: b });
  };
  visit(left, right, ''); return changes;
}
const execute = (input: Diagnostic, observe?: (frame: Frame) => void) => input.kind === 'a2-movement-diagnostic' ? replayMovement(input, observe) : replayRace(input, observe);
export function auditDiagnostic(input: Diagnostic) {
  const engine = execute(input); const actual = engine.latest();
  const checks = { matchesExportedHash: actual.stateHash === input.latestTick.stateHash, matchesExportedState: canonicalState(actual.state) === canonicalState(input.state), matchesJournal: canonicalState(engine.commandJournal()) === canonicalState(input.commandJournal), matchesLatestEvents: input.latestTick.events === undefined ? null : canonicalState(actual.events) === canonicalState(input.latestTick.events) };
  return { ...checks, valid: checks.matchesExportedHash && checks.matchesExportedState && checks.matchesJournal && checks.matchesLatestEvents !== false, stateHash: actual.stateHash, tick: actual.state.tick, phase: actual.state.phase, changedPaths: checks.matchesExportedState ? [] : changedPaths(input.state, actual.state), verifiedState: actual.state, latestEvents: actual.events, result: 'result' in engine ? engine.result() : null };
}
/** Re-execute inputs, store only one side's compact hash trace, then recover the first mismatching frames. */
export function compareDiagnostics(left: Diagnostic, right: Diagnostic) {
  if (left.kind !== right.kind) throw new Error('Choose two diagnostics from the same engine kind');
  const trace: { stateHash: string; eventHash: string }[] = [];
  execute(left, frame => trace.push({ stateHash: frame.stateHash, eventHash: stateHash(frame.events) }));
  let index = 0; let first = -1; let rightFrame: Frame | null = null;
  execute(right, frame => { const before = trace[index]; if (first < 0 && (!before || before.stateHash !== frame.stateHash || before.eventHash !== stateHash(frame.events))) { first = index; rightFrame = frame; } index++; });
  if (first < 0 && index !== trace.length) first = index;
  let leftFrame: Frame | null = null; let cursor = 0;
  if (first >= 0) execute(left, frame => { if (cursor++ === first) leftFrame = frame; });
  // The checksum is the established rounded-eight prototype comparison contract.
  const a = leftFrame as Frame | null; const b = rightFrame as Frame | null;
  return { kind: 'blood-thunder-comparison-e1', canonical: true, simulationVersion: left.initialConfiguration.scenario.simulationVersion, configurationChanges: changedPaths(left.initialConfiguration, right.initialConfiguration), framesCompared: Math.min(trace.length, index), leftFrames: trace.length, rightFrames: index,
    identical: first < 0, firstDifference: first < 0 ? null : { frameIndex: first, leftTick: a?.state.tick ?? null, rightTick: b?.state.tick ?? null, leftPhase: a?.state.phase ?? null, rightPhase: b?.state.phase ?? null, stateChanges: changedPaths(a?.state ?? null, b?.state ?? null), leftEvents: a?.events ?? [], rightEvents: b?.events ?? [], leftDiagnostics: a?.diagnostics ?? [], rightDiagnostics: b?.diagnostics ?? [] } };
}

/** Different/unsupported engine versions permit labeled static inspection only, never replay. */
export function compareDiagnosticSources(leftSource: string, rightSource: string) {
  const header = z.object({ initialConfiguration: z.object({ scenario: z.object({ simulationVersion: z.string(), schemaVersion: z.string() }) }), state: z.unknown() });
  const left = header.parse(parseSetupJson(leftSource,'left diagnostic')); const right = header.parse(parseSetupJson(rightSource,'right diagnostic'));
  const a = left.initialConfiguration.scenario; const b = right.initialConfiguration.scenario;
  if (a.simulationVersion !== b.simulationVersion || a.schemaVersion !== b.schemaVersion || a.simulationVersion !== SIMULATION_VERSION || a.schemaVersion !== SCHEMA_VERSION) return { kind: 'blood-thunder-comparison-e1', canonical: false, identical: null, reason: 'Noncanonical: incompatible/unsupported versions. Static serialized-state inspection only; no execution or determinism claim.', versions: { left: a, right: b }, stateChanges: changedPaths(left.state,right.state) };
  return compareDiagnostics(importDiagnostic(leftSource),importDiagnostic(rightSource));
}
