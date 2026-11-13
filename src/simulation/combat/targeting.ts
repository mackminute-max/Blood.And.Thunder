import { occupiesRu } from '../environment/lifecycle.ts';
import type { DeepReadonly, InitialConfiguration } from '../../contracts/initialization.ts';
import type { MovementState } from '../../contracts/movement.ts';
import type { AttackPlan } from '../../contracts/combat.ts';
import { perceive } from '../ai/driver.ts';
export type CombatState = Pick<MovementState, 'tick' | 'ruStates' | 'rngStates'>;
export function availableWeapons(config: DeepReadonly<InitialConfiguration>, state: DeepReadonly<CombatState>, ruId: string): string[] {
  const entry = config.scenario.entries.find(entry => entry.id === ruId)!; const ru = state.ruStates[ruId]!;
  const tuning = config.content.tuningProfiles.find(profile => profile.id === config.scenario.tuningProfileId)!.combat;
  return [...new Set([...entry.weaponIds.filter(id => config.content.weapons.find(weapon => weapon.id === id)!.channel === 'driver'), ...config.content.chariots.find(cart => cart.id === entry.chariotId)!.equipmentIds.filter(id => config.content.weapons.find(weapon => weapon.id === id)!.channel === 'mounted'), tuning.ramWeaponId,
    ...entry.beastIds.filter(id => ru.beasts.some(beast => beast.id === id && beast.health > 0)).flatMap(id => config.content.beasts.find(beast => beast.id === id)!.naturalAttackIds)])].sort();
}
export function targetComponents(config: DeepReadonly<InitialConfiguration>, state: DeepReadonly<CombatState>, plan: AttackPlan) {
  const target = state.ruStates[plan.targetRuId]; const weapon = config.content.weapons.find(weapon => weapon.id === plan.weaponId);
  if (!target || !weapon) return [];
  return [target.driver, target.chariot, ...target.beasts].filter(component => component.health > 0 && (component.kind !== 'beast' || config.scenario.rules.beastTargetingAllowed) && weapon.eligibleTargets.includes(component.kind) && weapon.targetWeights[component.kind] > 0)
    .sort((a, b) => a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : a.id < b.id ? -1 : 1);
}
/** Pure positional predicate: no damage or cooldown changes. */
export function attackEligibility(config: DeepReadonly<InitialConfiguration>, state: DeepReadonly<CombatState>, plan: AttackPlan): string | null {
  const actor = Object.hasOwn(state.ruStates, plan.ruId) ? state.ruStates[plan.ruId] : undefined; const target = Object.hasOwn(state.ruStates, plan.targetRuId) ? state.ruStates[plan.targetRuId] : undefined;
  const weapon = config.content.weapons.find(weapon => weapon.id === plan.weaponId);
  const tuning = config.content.tuningProfiles.find(profile => profile.id === config.scenario.tuningProfileId)!.combat;
  if (config.scenario.rules.competitionStyle === 'pure' || !config.scenario.rules.combatAllowed) return 'combat_prohibited';
  if (!actor || actor.status !== 'active') return 'actor_inactive';
  if (!target || target.status !== 'active' || target.id === actor.id) return 'target_ineligible';
  if (!weapon) return 'unknown_weapon';
  if (!availableWeapons(config, state, actor.id).includes(weapon.id)) return 'not_equipped_or_no_active_provider';
  if (weapon.channel === 'beast' && !config.scenario.entries.find(entry => entry.id === actor.id)!.beastIds.some(id => actor.beasts.some(beast => beast.id === id && beast.health > 0) && config.content.beasts.find(beast => beast.id === id)!.naturalAttackIds.includes(weapon.id))) return 'no_active_provider';
  if ((actor.cooldowns[weapon.channel] ?? 0) > 0 || (actor.actionCooldowns[weapon.id] ?? 0) > 0) return 'cooldown';
  if (!perceive(config, state, actor.id).objects.some(object => object.id === target.id)) return 'not_perceived';
  if (!targetComponents(config, state, plan).length) return 'no_eligible_component';
  const track = config.content.tracks.find(track => track.id === config.scenario.trackId)!;
  const from = track.segments.find(segment => segment.id === actor.tile.segmentId)!;
  const to = track.segments.find(segment => segment.id === target.tile.segmentId)!;
  const ahead = (to.order - from.order + track.segments.length) % track.segments.length;
  const behind = (from.order - to.order + track.segments.length) % track.segments.length;
  const side = ahead === 0 && Math.abs(actor.tile.lane - target.tile.lane) === 1;
  const forwardTile = from.lanes.find(lane => lane.index === actor.tile.lane)!.next;
  const forward = forwardTile.segmentId === target.tile.segmentId && forwardTile.lane === target.tile.lane;
  const arc = side ? 'side' : ahead > 0 && ahead <= behind ? 'front' : behind > 0 ? 'rear' : null;
  if (weapon.channel === 'ram' && !side) return 'ram_requires_lateral_geometry';
  if (!arc || !weapon.allowedArcs.includes(arc)) return 'out_of_arc';
  if (weapon.rangeMode === 'sameSegmentAdjacentLane' && !side) return 'out_of_range';
  if (weapon.rangeMode === 'forwardTile' && !forward) return 'out_of_range';
  if (weapon.rangeMode === 'adjacentTile' && !side && !forward) return 'out_of_range';
  if (weapon.rangeMode === 'segmentDistance') {
    const distance = arc === 'front' ? ahead : arc === 'rear' ? behind : 0;
    if (distance > weapon.rangeSegments || (!tuning.diagonalRanged && arc !== 'side' && actor.tile.lane !== target.tile.lane)) return 'out_of_range';
    if (tuning.rangedRuOcclusion) for (let step = 1; step < distance; step++) {
      const order = (from.order + (arc === 'rear' ? -step : step) + track.segments.length) % track.segments.length;
      const lane = Math.round(actor.tile.lane + (target.tile.lane - actor.tile.lane) * step / distance);
      if (Object.values(state.ruStates).some(ru => ru.id !== actor.id && ru.id !== target.id && occupiesRu(ru) && ru.tile.lane === lane && track.segments.find(segment => segment.id === ru.tile.segmentId)!.order === order)) return 'line_of_sight';
    }
  }
  return null;
}
