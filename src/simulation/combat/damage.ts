import type { DeepReadonly, InitialConfiguration, ComponentState } from '../../contracts/initialization.ts';
import type { MovementEventInput } from '../../contracts/movement.ts';
import type { CombatState } from './targeting.ts';
import type { createRng } from '../core/rng.ts';
export interface ComponentHit { ruId: string; kind: ComponentState['kind']; componentId: string; total: number; attacks: string[]; contributors: { ruId: string; amount: number }[] }
/** Shared component consequences for combat and physical contact. */
export function commitDamage(config: DeepReadonly<InitialConfiguration>, state: CombatState, damage: ReadonlyMap<string, ComponentHit>, rng: ReturnType<typeof createRng>, emit: (event: MovementEventInput) => void, phase: string, fraction: number) {
  const losses = new Map<string, number>();
  const tuning = config.content.tuningProfiles.find(profile => profile.id === config.scenario.tuningProfileId)!;
  for (const key of [...damage.keys()].sort()) {
    const hit = damage.get(key)!; const ru = state.ruStates[hit.ruId]!;
    const component = [ru.driver, ru.chariot, ...ru.beasts].find(component => component.id === hit.componentId && component.kind === hit.kind)!;
    const cart = config.content.chariots.find(cart => cart.id === ru.chariot.id)!;
    const durabilityFactor = hit.kind === 'chariot' ? Math.max(.1, 1 + (cart.durability - tuning.attributes.durabilityReference) * tuning.attributes.durabilityPerPoint) : 1;
    const oldHealth = component.health; component.health = Math.max(0, oldHealth - hit.total / durabilityFactor);
    const percent = component.health / component.maxHealth * 100;
    component.band = percent <= 0 ? 'disabled' : percent <= tuning.condition.criticalMaxPercent ? 'critical' : percent <= tuning.condition.damagedMaxPercent ? 'damaged' : 'functional';
    const actual = oldHealth - component.health; losses.set(key, actual); ru.combatStats.damageReceived += actual;
    // Attribute actual HP loss across simultaneous contributors proportionally, without overkill credit.
    for (const contributor of hit.contributors) state.ruStates[contributor.ruId]!.combatStats.damageDealt += actual * contributor.amount / hit.total;
    emit({ type: 'component_damaged', ruId: ru.id, fraction: fraction, details: { phase, durabilityFactor, componentId: component.id, componentKind: component.kind, oldHealth, newHealth: component.health, amount: actual, band: component.band, attackIds: hit.attacks } });
    if (oldHealth > 0 && component.health === 0) {
      const profile = config.content.lethalityProfiles.find(profile => profile.id === config.scenario.lethalityProfileId)!;
      if (component.kind === 'chariot') component.destroyed = rng.next() < profile.destructionChance;
      else { if (rng.next() < profile.severeInjuryChance) component.injuries.push('severe-injury'); component.dead = rng.next() < profile.fatalityChance; }
      emit({ type: 'component_disabled', ruId: ru.id, fraction: fraction, details: { phase, componentId: component.id, componentKind: component.kind, dead: component.dead, destroyed: component.destroyed, injuries: component.injuries, attackIds: hit.attacks } });
    }
  }
  for (const ru of Object.values(state.ruStates)) if (ru.status === 'active' && (ru.driver.health === 0 || ru.chariot.health === 0 || ru.beasts.every(beast => beast.health === 0))) {
    ru.status = 'disabled'; ru.statusReason = ru.driver.health === 0 ? 'driver_disabled' : ru.chariot.health === 0 ? 'chariot_disabled' : 'team_disabled'; ru.speedMps = 0; ru.targetSpeedMps = 0;
    emit({ type: 'ru_disabled', ruId: ru.id, fraction: fraction, details: { phase, reason: ru.statusReason } });
  }
  return losses;
}
