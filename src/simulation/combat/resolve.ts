import { commitDamage } from './damage.ts';
import type { DeepReadonly, InitialConfiguration, ComponentState } from '../../contracts/initialization.ts';
import type { MovementEventInput, MovementDiagnostic } from '../../contracts/movement.ts';
import type { AttackPlan, CombatPhase } from '../../contracts/combat.ts';
import { attackEligibility, targetComponents } from './targeting.ts';
import type { CombatState } from './targeting.ts';
import { createRng } from '../core/rng.ts';
import { perceive } from '../ai/driver.ts';
import { clamp } from '../../shared/math.ts';
import { copyJson } from '../../shared/immutable.ts';
export function advanceCooldowns(state: CombatState): void {
  for (const ru of Object.values(state.ruStates)) for (const counters of [ru.cooldowns, ru.actionCooldowns]) for (const id of Object.keys(counters)) counters[id] = Math.max(0, counters[id]! - 1);
}
export function assertCombatState(config: DeepReadonly<InitialConfiguration>, state: DeepReadonly<CombatState>): void {
  const tuning = config.content.tuningProfiles.find(profile => profile.id === config.scenario.tuningProfileId)!;
  for (const ru of Object.values(state.ruStates)) {
    for (const value of Object.values({ ...ru.cooldowns, ...ru.actionCooldowns })) if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid cooldown for ${ru.id}`);
    for (const component of [ru.driver, ru.chariot, ...ru.beasts]) {
      const percent = component.health / component.maxHealth * 100;
      const band = percent <= 0 ? 'disabled' : percent <= tuning.condition.criticalMaxPercent ? 'critical' : percent <= tuning.condition.damagedMaxPercent ? 'damaged' : 'functional';
      if (!Number.isFinite(component.health) || component.health < 0 || component.health > component.maxHealth || component.band !== band || component.dead && (component.kind === 'chariot' || component.health > 0) || component.destroyed && (component.kind !== 'chariot' || component.health > 0)) throw new Error(`Invalid component state ${component.id}`);
    }
  }
}
/** Approved: all eligible actions roll against one frozen phase snapshot, then commit. */
export function resolveCombatPhase(config: DeepReadonly<InitialConfiguration>, state: CombatState, plans: readonly AttackPlan[], guards: ReadonlySet<string>, phase: CombatPhase, emit: (event: MovementEventInput) => void, diagnostics: MovementDiagnostic[], substep = 0) {
  const tuning = config.content.tuningProfiles.find(profile => profile.id === config.scenario.tuningProfileId)!;
  const t = tuning.combat; const snapshot = copyJson(state); const rng = createRng(state.rngStates.combat);
  const guarded = new Set<string>(); const reserved = new Set<string>();
  const damage = new Map<string, { ruId: string; kind: ComponentState['kind']; componentId: string; total: number; attacks: string[]; contributors: { ruId: string; amount: number }[] }>();
  const impacts: { actor: string; target: string; factor: number }[] = [];
  const useCooldown = (plan: AttackPlan) => {
    const weapon = config.content.weapons.find(weapon => weapon.id === plan.weaponId)!;
    state.ruStates[plan.ruId]!.cooldowns[weapon.channel] = weapon.cooldownTicks;
    state.ruStates[plan.ruId]!.actionCooldowns[weapon.id] = weapon.cooldownTicks;
  };
  for (const plan of [...plans].sort((a, b) => a.ruId < b.ruId ? -1 : a.ruId > b.ruId ? 1 : a.weaponId < b.weaponId ? -1 : a.weaponId > b.weaponId ? 1 : a.targetRuId < b.targetRuId ? -1 : 1)) {
    const weapon = config.content.weapons.find(weapon => weapon.id === plan.weaponId)!;
    if (!weapon) { emit({ type: 'attack_rejected', ruId: plan.ruId, fraction: phase === 'postMove' ? 1 : 0, details: { ...plan, phase, reason: 'unknown_weapon', cooldownConsumed: false } }); continue; }
    if (weapon.timing !== phase) continue;
    const slot = `${plan.ruId}:${weapon.channel}`;
    const rejected = reserved.has(slot) ? 'channel_reserved' : !t.guardAllowsDriverAttack && weapon.channel === 'driver' && guards.has(plan.ruId) ? 'guard_driver_exclusive' : attackEligibility(config, snapshot, plan);
    if (rejected) {
      const consume = t.cancelConsumesCooldown && ['out_of_range', 'out_of_arc', 'line_of_sight'].includes(rejected) && snapshot.ruStates[plan.ruId]?.status === 'active';
      if (consume) useCooldown(plan);
      emit({ type: 'attack_rejected', ruId: plan.ruId, fraction: phase === 'postMove' ? 1 : 0, details: { ...plan, phase, reason: rejected, cooldownConsumed: consume } });
      continue;
    }
    reserved.add(slot);
    const actor = snapshot.ruStates[plan.ruId]!; const target = snapshot.ruStates[plan.targetRuId]!;
    const actorEntry = config.scenario.entries.find(entry => entry.id === actor.id)!;
    const targetEntry = config.scenario.entries.find(entry => entry.id === target.id)!;
    const driver = config.content.drivers.find(driver => driver.id === actorEntry.driverId)!;
    const defender = config.content.drivers.find(driver => driver.id === targetEntry.driverId)!;
    const conditionFactor = (band: ComponentState['band']) => band === 'functional' ? 1 : tuning.stats.conditionFactors[band];
    const providers = actor.beasts.filter(beast => beast.health > 0 && config.content.beasts.find(definition => definition.id === beast.id)!.naturalAttackIds.includes(weapon.id));
    const skill = weapon.channel === 'beast' ? providers.reduce((sum, beast) => sum + config.content.beasts.find(definition => definition.id === beast.id)![t.beastSkillStat] * conditionFactor(beast.band), 0) / providers.length : (weapon.channel === 'ram' ? driver.driving : driver.combat) * conditionFactor(actor.driver.band);
    const defenseSkill = defender.driving * conditionFactor(target.driver.band);
    const visible = perceive(config, snapshot, target.id).objects.some(object => object.id === actor.id);
    const activeGuard = guards.has(target.id) && visible && !guarded.has(target.id) && (target.cooldowns.defense ?? 0) === 0;
    const attackId = `${state.tick}:${phase}:${plan.ruId}:${plan.weaponId}:${plan.targetRuId}`;
    emit({ type: weapon.channel === 'ram' ? 'ram_attempt' : 'attack_attempt', ruId: actor.id, fraction: phase === 'preMove' ? 0 : phase === 'contact' ? 0 : 1, details: { ...plan, phase, attackId, channel: weapon.channel } });
    if (activeGuard) {
      guarded.add(target.id); state.ruStates[target.id]!.cooldowns.defense = t.defenseCooldownTicks; state.ruStates[target.id]!.combatStats.defenses++;
      emit({ type: 'defense_used', ruId: target.id, fraction: phase === 'postMove' ? 1 : 0, details: { against: actor.id, attackId, phase, cooldownTicks: t.defenseCooldownTicks } });
    }
    const visibility = config.content.weather.find(weather => weather.id === config.scenario.weatherId)!.visibility;
    const rawChance = weapon.accuracyBase + t.attackSkillCoefficient * (skill - t.skillCenter) - t.defenseSkillCoefficient * (defenseSkill - t.skillCenter) + t.positionalBonus - (weapon.rangeMode === 'segmentDistance' ? Math.max(0, 1 - visibility) * t.visibilityPenalty : 0) - (activeGuard ? t.guardReduction : 0);
    if (!Number.isFinite(rawChance)) throw new Error('Nonfinite hit probability');
    const chance = clamp(rawChance, t.hitMin, t.hitMax); const hitRoll = rng.next(); useCooldown(plan);
    const stats = state.ruStates[actor.id]!.combatStats; stats.attempts++; if (weapon.channel === 'ram') stats.ramAttempts++;
    if (hitRoll >= chance) { emit({ type: 'attack_miss', ruId: actor.id, fraction: phase === 'postMove' ? 1 : 0, details: { ...plan, phase, attackId, chance, hitRoll } }); continue; }
    stats.hits++;
    const candidates = targetComponents(config, snapshot, plan);
    const kinds = [...new Set(candidates.map(component => component.kind))].sort();
    const totalWeight = kinds.reduce((sum, kind) => sum + weapon.targetWeights[kind], 0);
    if (!Number.isFinite(totalWeight) || totalWeight <= 0) throw new Error('Invalid weighted component target total');
    let selection = rng.next() * totalWeight; let kind = kinds.at(-1)!;
    for (const candidate of kinds) { selection -= weapon.targetWeights[candidate]; if (selection < 0) { kind = candidate; break; } }
    const individuals = candidates.filter(component => component.kind === kind);
    const selected = individuals[individuals.length > 1 ? Math.floor(rng.next() * individuals.length) : 0]!;
    const rawDamage = weapon.minDamage + Math.floor(rng.next() * (weapon.maxDamage - weapon.minDamage + 1));
    let severity: 'minor' | 'moderate' | 'major' = 'minor';
    if (weapon.channel === 'ram') {
      const cart = config.content.chariots.find(cart => cart.id === actorEntry.chariotId)!;
      const closing = Math.max(Math.abs(actor.speedMps - target.speedMps), t.ramLateralSpeedMps);
      const impactEnergyIndex = (cart.weightKg + actor.beasts.length * t.beastMassEquivalentKg) * closing * closing / 2;
      if (!Number.isFinite(impactEnergyIndex)) throw new Error('Nonfinite impact energy');
      severity = impactEnergyIndex < t.minorImpactEnergy ? 'minor' : impactEnergyIndex < t.majorImpactEnergy ? 'moderate' : 'major';
      impacts.push({ actor: actor.id, target: target.id, factor: t.impactSpeedFactor[severity] });
      emit({ type: 'contact', ruId: actor.id, fraction: 0, details: { ...plan, attackId, phase, severity, impactEnergyIndex, deliberateLateralRam: true } });
    }
    const protection = config.content.chariots.find(cart => cart.id === targetEntry.chariotId)!.protection * conditionFactor(target.chariot.band);
    const amount = Math.max(t.minimumDamage, Math.round(rawDamage * (weapon.channel === 'ram' ? t.impactDamageFactor[severity] : 1)) - Math.round(protection / t.protectionDivisor));
    if (!Number.isFinite(amount)) throw new Error('Nonfinite damage');
    const key = `${target.id}:${selected.kind}:${selected.id}`;
    const aggregate = damage.get(key) ?? { ruId: target.id, kind: selected.kind, componentId: selected.id, total: 0, attacks: [], contributors: [] };
    aggregate.total += amount; aggregate.attacks.push(attackId); aggregate.contributors.push({ ruId: actor.id, amount }); damage.set(key, aggregate);
    emit({ type: 'attack_hit', ruId: actor.id, fraction: phase === 'postMove' ? 1 : 0, details: { ...plan, phase, attackId, channel: weapon.channel, componentId: selected.id, componentKind: selected.kind, amount, rawDamage, protection, skill, defenseSkill, chance, hitRoll, activeGuard, severity } });
  }
  commitDamage(config, state, damage, rng, emit, phase, phase === 'postMove' ? 1 : 0);
  for (const impact of impacts) for (const id of [impact.actor, impact.target]) state.ruStates[id]!.speedMps *= impact.factor;
  state.rngStates.combat = [...rng.snapshot()];
  diagnostics.push({ tick: state.tick, substep, level: 'trace', subsystem: 'combat', message: 'Resolved simultaneous phase against frozen eligible state', details: { phase, plans, guarded: [...guarded].sort(), damage: [...damage.values()] } });
  assertCombatState(config, state);
}
