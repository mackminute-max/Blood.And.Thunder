import type { DeepReadonly, InitialConfiguration } from '../../contracts/initialization.ts';
import type { MovementEventInput, MovementDiagnostic } from '../../contracts/movement.ts';
import type { AttackPlan, CombatCandidate, CombatChannel } from '../../contracts/combat.ts';
import type { CombatState } from './targeting.ts';
import { availableWeapons, attackEligibility } from './targeting.ts';
import { perceive } from '../ai/driver.ts';
import { seedStreams, createRng } from '../core/rng.ts';
export function planCombat(config: DeepReadonly<InitialConfiguration>, state: CombatState, movementTick: number, emit: (event: MovementEventInput) => void, diagnostics: MovementDiagnostic[]) {
  const tuning = config.content.tuningProfiles.find(profile => profile.id === config.scenario.tuningProfileId)!.combat;
  const a = tuning.ai; const plans: AttackPlan[] = []; const guards = new Set<string>();
  const noise = (key: string) => (createRng(seedStreams(JSON.stringify([config.scenario.seed, 'combat-ai-v1', movementTick, key])).ai).next() * 2 - 1) * a.noise;
  for (const ruId of Object.keys(state.ruStates).sort()) {
    const ru = state.ruStates[ruId]!; ru.combatDecision = null;
    if (ru.status !== 'active') continue;
    const entry = config.scenario.entries.find(entry => entry.id === ruId)!;
    const driver = config.content.drivers.find(driver => driver.id === entry.driverId)!;
    const visible = perceive(config, state, ruId).objects;
    const caution = (50 - driver.personality.riskTolerance) / 50;
    const guardUtility = a.guardBase + (visible.length ? a.guardThreat : 0) + caution * a.guardRisk + (entry.preRaceStrategy === 'defensive' ? a.defendStrategy : 0) + (ru.activeSignId === 'defend-position' ? a.defendSign * (1 + config.content.tuningProfiles.find(profile => profile.id === config.scenario.tuningProfileId)!.ai.disciplineSign * (driver.personality.discipline - 50) / 50) : 0);
    const guard = config.scenario.controller === 'fixture' ? config.scenario.guardPlans.some(plan => plan.movementTick === movementTick && plan.ruId === ruId) : config.scenario.rules.combatAllowed && (ru.cooldowns.defense ?? 0) === 0 && guardUtility > a.noneUtility;
    if (guard) guards.add(ruId);
    const candidates: CombatCandidate[] = []; const selected: AttackPlan[] = [];
    if (config.scenario.controller === 'fixture') {
      const slots = new Set<string>();
      for (const plan of config.scenario.combatPlans.filter(plan => plan.movementTick === movementTick && plan.ruId === ruId)) {
        const weapon = config.content.weapons.find(weapon => weapon.id === plan.weaponId)!;
        const reason = slots.has(weapon.channel) ? 'channel_reserved' : guard && !tuning.guardAllowsDriverAttack && weapon.channel === 'driver' ? 'guard_driver_exclusive' : attackEligibility(config, state, plan);
        candidates.push({ ruId, targetRuId: plan.targetRuId, weaponId: plan.weaponId, channel: weapon.channel, rejected: reason, utility: 0, factors: {} });
        if (!reason) { selected.push({ ruId, targetRuId: plan.targetRuId, weaponId: plan.weaponId }); slots.add(weapon.channel); }
        else emit({ type: 'attack_rejected', ruId, fraction: 0, details: { ...plan, reason, phase: 'planning', cooldownConsumed: false } });
      }
    } else if (config.scenario.rules.competitionStyle !== 'pure') {
      for (const weaponId of availableWeapons(config, state, ruId)) {
        const weapon = config.content.weapons.find(weapon => weapon.id === weaponId)!;
        for (const target of visible) {
          const plan = { ruId, targetRuId: target.id, weaponId };
          const rejected = guard && !tuning.guardAllowsDriverAttack && weapon.channel === 'driver' ? 'guard_driver_exclusive' : attackEligibility(config, state, plan);
          const personality = a.aggression * (driver.personality.aggression - 50) / 50;
          const sign = ru.activeSignId === 'attack' ? (a.attackSign + (weapon.channel === 'ram' ? a.ramSign : 0)) * (1 + config.content.tuningProfiles.find(profile => profile.id === config.scenario.tuningProfileId)!.ai.disciplineSign * (driver.personality.discipline - 50) / 50) : ru.activeSignId === 'conserve' ? -a.defensivePenalty : 0;
          const strategy = entry.preRaceStrategy === 'aggressive' ? a.aggressiveStrategy : entry.preRaceStrategy === 'opportunistic' ? a.opportunisticStrategy : entry.preRaceStrategy === 'defensive' || entry.preRaceStrategy === 'endurance' ? -a.defensivePenalty : 0;
          const conditionRisk = (1 - Math.min(ru.driver.health / ru.driver.maxHealth, ru.chariot.health / ru.chariot.maxHealth)) * a.riskCost;
          const recovery = weapon.cooldownTicks * a.cooldownCost;
          const variation = noise(`${ruId}:${weaponId}:${target.id}`);
          const utility = a.attackBase + personality + sign + strategy - conditionRisk - recovery - (guard ? a.guardAttackPenalty : 0) + variation;
          if (!Number.isFinite(utility)) throw new Error('Nonfinite combat utility');
          candidates.push({ ...plan, channel: weapon.channel, rejected, utility, factors: { personality, sign, strategy, conditionRisk, recovery, variation, guardCost: guard ? a.guardAttackPenalty : 0 } });
        }
      }
      for (const channel of ['driver', 'beast', 'mounted', 'ram'] as CombatChannel[]) {
        const eligible = candidates.filter(candidate => candidate.channel === channel && !candidate.rejected && candidate.utility > a.noneUtility).sort((x, y) => y.utility - x.utility || (x.weaponId < y.weaponId ? -1 : x.weaponId > y.weaponId ? 1 : x.targetRuId < y.targetRuId ? -1 : 1));
        if (eligible[0]) { const { ruId, targetRuId, weaponId } = eligible[0]; selected.push({ ruId, targetRuId, weaponId }); }
      }
    }
    ru.combatDecision = { movementTick, candidates, selected, guard, guardUtility };
    plans.push(...selected);
    emit({ type: 'combat_intent', ruId, fraction: 0, details: { decision: ru.combatDecision, noneUtility: a.noneUtility } });
    diagnostics.push({ tick: state.tick, substep: 0, level: 'trace', subsystem: 'combat', ruId, message: 'Combat candidates, channel reservations and guard policy', details: { decision: ru.combatDecision } });
  }
  return { plans, guards };
}
