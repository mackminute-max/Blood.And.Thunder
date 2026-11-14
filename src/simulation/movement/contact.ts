import { traceDiagnostic } from '../core/diagnostics.ts';
import type { DeepReadonly, InitialConfiguration } from '../../contracts/initialization.ts';
import type { MovementState, MovementEventInput, MovementDiagnostic } from '../../contracts/movement.ts';
import { commitDamage } from '../combat/damage.ts';
import type { ComponentHit } from '../combat/damage.ts';
import { createRng } from '../core/rng.ts';
import { perceive } from '../ai/driver.ts';
import { occupiesRu } from '../environment/lifecycle.ts';
import { copyJson } from '../../shared/immutable.ts';
import { clamp } from '../../shared/math.ts';
export interface ContactRequest { actorId: string; targetId: string; lateral: boolean; fraction: number; closingSpeed: number }
/** Resolve each unordered physical pair once per atomic group; commit damage together. */
export function resolveContacts(config: DeepReadonly<InitialConfiguration>, state: Pick<MovementState, 'tick' | 'ruStates' | 'rngStates'>, requests: readonly ContactRequest[], draw: () => number, emitOutput: (event: MovementEventInput) => void, diagnostics: MovementDiagnostic[], substep: number) {
  const emitted: MovementEventInput[] = [];
  const emit = (event: MovementEventInput) => emitted.push(event);
  const tuning = config.content.tuningProfiles.find(t => t.id === config.scenario.tuningProfileId)!; const t = tuning.environment.collision; if (!t.enabled || !requests.length) return;
  const frozen = copyJson(state); const pairs = new Set<string>(); const damage = new Map<string, ComponentHit>(); const impacts: { ids: string[]; factor: number }[] = [];
  const rng = createRng(state.rngStates.combat);
  for (const request of [...requests].sort((a, b) => a.actorId < b.actorId ? -1 : a.actorId > b.actorId ? 1 : a.targetId < b.targetId ? -1 : 1)) {
    const pair = [request.actorId, request.targetId].sort().join(':');
    const actor = frozen.ruStates[request.actorId]; const target = frozen.ruStates[request.targetId];
    if (!actor || !target || actor.id === target.id || actor.status !== 'active' || !occupiesRu(target) || pairs.has(pair)) continue;
    const relativeSpeed = request.lateral ? Math.max(request.closingSpeed, t.lateralRelativeSpeed) : request.closingSpeed;
    if (relativeSpeed < t.minimumClosingSpeed) continue; pairs.add(pair);
    const entry = config.scenario.entries.find(e => e.id === actor.id)!; const driver = config.content.drivers.find(d => d.id === entry.driverId)!;
    const perceived = perceive(config, frozen, actor.id).objects.some(object => object.id === target.id);
    const awareness = driver.awareness * (actor.driver.band === 'functional' ? 1 : tuning.stats.conditionFactors[actor.driver.band]);
    const probability = perceived ? clamp(t.avoidanceBase + (actor.derived.handling - t.skillCenter) / t.handlingDivisor + (awareness - t.skillCenter) / t.awarenessDivisor + (driver.nerve - t.skillCenter) * tuning.attributes.nerveAvoidancePerPoint, t.avoidanceMin, t.avoidanceMax) : 0;
    const roll = draw();
    if (roll < probability) { emit({ type: 'collision_avoided', ruId: actor.id, fraction: request.fraction, details: { ...request, probability, roll, perceived } }); continue; }
    const cart = config.content.chariots.find(c => c.id === entry.chariotId)!;
    const energy = (cart.weightKg + actor.beasts.length * tuning.combat.beastMassEquivalentKg) * relativeSpeed * relativeSpeed / 2;
    const severity = energy < tuning.combat.minorImpactEnergy ? 'minor' : energy < tuning.combat.majorImpactEnergy ? 'moderate' : 'major';
    impacts.push({ ids: [actor.id, target.id], factor: tuning.combat.impactSpeedFactor[severity] });
    emit({ type: 'contact', ruId: actor.id, fraction: request.fraction, details: { ...request, accidental: true, actionKind: 'incidental_contact', probability, roll, perceived, energy, severity } });
    for (const id of [actor.id, target.id]) {
      const ru = frozen.ruStates[id]!; state.ruStates[id]!.environmentStats.collisions++;
      const entry = config.scenario.entries.find(e => e.id === id)!; const protection = config.content.chariots.find(c => c.id === entry.chariotId)!.protection;
      const amount = Math.max(0, Math.round(t.damage[severity] * Math.max(0, 1 - ru.derived.stability / t.stabilityDivisor)) - Math.round(protection / tuning.combat.protectionDivisor));
      if (amount <= 0 || ru.chariot.health <= 0) continue;
      const key = `${id}:chariot:${ru.chariot.id}`; const hit = damage.get(key) ?? { ruId: id, kind: 'chariot', componentId: ru.chariot.id, total: 0, attacks: [], contributors: [] };
      hit.total += amount; hit.attacks.push(`${state.tick}:${substep}:collision:${pair}`); damage.set(key, hit);

      emit({ type: 'collision_damage', ruId: id, fraction: request.fraction, details: { pair, severity, amount, componentId: ru.chariot.id, energy } });
    }
  }
  const healthBefore = new Map([...damage.values()].map(hit=>[hit.ruId,state.ruStates[hit.ruId]!.chariot.health]));
  const actualLosses = commitDamage(config, state, damage, rng, emit, 'collision', Math.max(0, ...requests.map(r => r.fraction)));
  for (const [id,health] of healthBefore) state.ruStates[id]!.environmentStats.collisionDamage += health - state.ruStates[id]!.chariot.health;
  for (const impact of impacts) for (const id of impact.ids) state.ruStates[id]!.speedMps *= impact.factor;
  state.rngStates.combat = [...rng.snapshot()];
  for (const event of emitted) {
    if ('details' in event && (event.type === 'attack_hit' || event.type === 'collision_damage')) {
      const d = event.details;
      const ruId = event.type === 'attack_hit' ? String(d.targetRuId) : event.ruId;
      const kind = event.type === 'attack_hit' ? String(d.componentKind) : 'chariot';
      const key = `${ruId}:${kind}:${String(d.componentId)}`;
      const nominalDamage = Number(d.amount);
      const total = damage.get(key)?.total ?? 0;
      d.nominalDamage = nominalDamage;
      d.actualDamage = total > 0 ? (actualLosses.get(key) ?? 0) * nominalDamage / total : 0;
      d.amount = d.actualDamage;
    }
    emitOutput(event);
  }

  traceDiagnostic(diagnostics, () => ({ tick: state.tick, substep, level: 'trace', subsystem: 'movement', message: 'Resolved accidental contact separately from occupancy conflicts', details: { requests, pairs: [...pairs], damage: [...damage.values()] } }));
}
