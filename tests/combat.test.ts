import { expect, it } from 'vitest';
import { fixture } from './setup-fixture.ts';
import { createMovementEngine } from '../src/simulation/core/movement-engine.ts';
import { createRaceEngine, assertRaceState } from '../src/simulation/core/race-engine.ts';
import { attackEligibility, availableWeapons } from '../src/simulation/combat/targeting.ts';
import { resolveCombatPhase, advanceCooldowns, assertCombatState } from '../src/simulation/combat/resolve.ts';
import { planCombat } from '../src/simulation/combat/planning.ts';
import { replayRace, replayMovement } from '../src/simulation/core/replay.ts';
import type { RaceScenario, ContentRegistry } from '../src/configuration/schemas.ts';
import { validateSetup } from '../src/configuration/validate.ts';
import { copyJson } from '../src/shared/immutable.ts';
import type { MovementEventInput } from '../src/contracts/movement.ts';
import type { AttackPlan, CombatPhase } from '../src/contracts/combat.ts';
const sword: AttackPlan = { ruId: 'ru-player', targetRuId: 'ru-iron', weaponId: 'short-sword' };
const bow: AttackPlan = { ...sword, weaponId: 'short-bow' };
function setup(): { scenario: RaceScenario; content: ContentRegistry } {
  const f = fixture(); const t = f.content.tuningProfiles[0]!;
  t.combat.hitMin = 1; t.combat.hitMax = 1;
  f.content.beasts.filter(beast => beast.id.startsWith('beast-player')).forEach(beast => { beast.naturalAttackIds = ['beast-gore']; });
  f.scenario.entries[0]!.weaponIds = ['short-sword', 'short-bow'];
  f.scenario.entries[1]!.weaponIds = ['short-sword', 'short-bow'];
  return f;
}
function harness(f = setup()) {
  const engine = createMovementEngine(f.scenario, f.content); const state = copyJson(engine.snapshot()); state.tick = 1;
  const config = engine.initialConfiguration;
  const events: MovementEventInput[] = [];
  const resolve = (plans: AttackPlan[], phase: CombatPhase = 'postMove', guards = new Set<string>()) => resolveCombatPhase(config, state, plans, guards, phase, event => events.push(event), []);
  return { f, engine, state, config, events, resolve };
}
it('validates side melee, forward/rear ranged, range, arc and independent providers', () => {
  const h = harness(); expect(attackEligibility(h.config, h.state, sword)).toBeNull();
  h.state.ruStates['ru-iron']!.tile = { segmentId: 'seg-01', lane: 0 };
  expect(attackEligibility(h.config, h.state, sword)).toBe('out_of_arc');
  expect(attackEligibility(h.config, h.state, bow)).toBeNull();
  h.state.ruStates['ru-iron']!.tile = { segmentId: 'seg-47', lane: 0 };
  expect(attackEligibility(h.config, h.state, bow)).toBeNull();
  h.state.ruStates['ru-iron']!.tile = { segmentId: 'seg-04', lane: 0 };
  expect(attackEligibility(h.config, h.state, bow)).toBe('out_of_range');
  expect(availableWeapons(h.config, h.state, 'ru-player')).toContain('side-ram');
});
it('checks line of sight including disabled obstructions, diagonal range and perception', () => {
  const h = harness(); h.state.ruStates['ru-iron']!.tile = { segmentId: 'seg-02', lane: 0 };
  h.state.ruStates['ru-ash']!.tile = { segmentId: 'seg-01', lane: 0 }; h.state.ruStates['ru-ash']!.status = 'disabled';
  expect(attackEligibility(h.config, h.state, bow)).toBe('line_of_sight');
  h.state.ruStates['ru-ash']!.status = 'retired'; expect(attackEligibility(h.config, h.state, bow)).toBeNull();
  h.state.ruStates['ru-iron']!.tile.lane = 1; expect(attackEligibility(h.config, h.state, bow)).toBe('out_of_range');
  h.state.ruStates['ru-iron']!.tile.segmentId = 'seg-20'; expect(attackEligibility(h.config, h.state, bow)).toBe('not_perceived');
});
it('rejects unequipped actions, prohibited combat and prohibited beast-only targets', () => {
  const f = setup(); f.scenario.rules.combatAllowed = false;
  expect(attackEligibility(harness(f).config, harness(f).state, sword)).toBe('combat_prohibited');
  const h = harness(); expect(attackEligibility(h.config, h.state, { ...sword, weaponId: 'missing' })).toBe('unknown_weapon');
  const b = setup(); b.scenario.rules.beastTargetingAllowed = false;
  const w = b.content.weapons.find(w => w.id === 'short-sword')!; w.eligibleTargets = ['beast']; w.targetWeights = { beast: 1, driver: 0, chariot: 0 };
  const hb = harness(b); expect(attackEligibility(hb.config, hb.state, sword)).toBe('no_eligible_component');
});
it('applies integer damage, protection, condition bands, separate action/channel readiness and decrement', () => {
  const h = harness(); h.resolve([sword]);
  const hit = h.events.find(e => e.type === 'attack_hit')!; expect(hit).toBeDefined();
  if (hit.type !== 'attack_hit') throw new Error('Missing hit');
  expect(hit.details.amount).toBe(Math.max(1, Number(hit.details.rawDamage) - Math.round(Number(hit.details.protection) / 25)));
  const ru = h.state.ruStates['ru-player']!; expect(ru.cooldowns.driver).toBe(5); expect(ru.actionCooldowns['short-sword']).toBe(5); expect(ru.cooldowns.beast).toBe(0);
  expect(attackEligibility(h.config, h.state, bow)).toBe('cooldown');
  for (let i = 0; i < 5; i++) advanceCooldowns(h.state);
  expect(attackEligibility(h.config, h.state, sword)).toBeNull(); assertCombatState(h.config, h.state);
});
it('commits mutual same-phase disablement even when the first actor kills its opponent', () => {
  const f = setup(); const w = f.content.weapons.find(w => w.id === 'short-sword')!;
  w.minDamage = 1000; w.maxDamage = 1000; w.eligibleTargets = ['driver']; w.targetWeights = { driver: 1, beast: 0, chariot: 0 };
  const h = harness(f); h.resolve([sword, { ...sword, ruId: 'ru-iron', targetRuId: 'ru-player' }]);
  expect(h.events.filter(e => e.type === 'attack_hit')).toHaveLength(2);
  expect(h.state.ruStates['ru-player']!.status).toBe('disabled'); expect(h.state.ruStates['ru-iron']!.status).toBe('disabled');
  expect(h.state.ruStates['ru-player']!.combatStats.damageDealt).toBe(100);
});
it('consumes guard only on an actual perceived threat, at most once across phases', () => {
  const h = harness(); const guards = new Set(['ru-iron']); h.resolve([], 'preMove', guards); expect(h.state.ruStates['ru-iron']!.cooldowns.defense).toBe(0);
  h.state.ruStates['ru-iron']!.tile = { segmentId: 'seg-01', lane: 0 }; h.resolve([bow], 'preMove', guards);
  h.state.ruStates['ru-iron']!.tile = { segmentId: 'seg-00', lane: 1 }; h.resolve([{ ...sword, weaponId: 'side-ram' }], 'contact', guards);
  expect(h.events.filter(e => e.type === 'defense_used')).toHaveLength(1); expect(h.state.ruStates['ru-iron']!.cooldowns.defense).toBe(6);
});
it('guard reduction and miss still consume independent readiness without damage', () => {
  const f = setup(); f.content.tuningProfiles[0]!.combat.hitMin = 0; f.content.tuningProfiles[0]!.combat.hitMax = 0;
  const h = harness(f); h.resolve([sword], 'postMove', new Set(['ru-iron']));
  expect(h.events.some(e => e.type === 'attack_miss')).toBe(true); expect(h.state.ruStates['ru-player']!.cooldowns.driver).toBe(5);
  expect(h.state.ruStates['ru-iron']!.combatStats.damageReceived).toBe(0);
});
it('rejects duplicate channel actions while allowing explicitly selected beast/ram channels', () => {
  const h = harness(); h.resolve([sword, sword]); expect(h.events.filter(e => e.type === 'attack_hit')).toHaveLength(1);
  expect(h.events.some(e => e.type === 'attack_rejected' && e.details.reason === 'channel_reserved')).toBe(true);
  h.resolve([{ ...sword, weaponId: 'beast-gore' }]); expect(h.state.ruStates['ru-player']!.cooldowns.beast).toBe(7);
  h.resolve([{ ...sword, weaponId: 'side-ram' }], 'contact'); expect(h.events.some(e => e.type === 'contact')).toBe(true); expect(h.state.ruStates['ru-player']!.cooldowns.ram).toBe(10);
});
it('lateral ram never becomes a rear-end attack or a free driver action', () => {
  const h = harness(); const ram = { ...sword, weaponId: 'side-ram' }; h.resolve([ram], 'contact');
  expect(h.state.ruStates['ru-player']!.cooldowns.driver).toBe(0); expect(h.events.filter(e => e.type === 'attack_hit')).toHaveLength(1);
  h.state.ruStates['ru-player']!.cooldowns.ram = 0; h.state.ruStates['ru-player']!.actionCooldowns['side-ram'] = 0;
  h.state.ruStates['ru-iron']!.tile = { segmentId: 'seg-01', lane: 0 };
  expect(attackEligibility(h.config, h.state, ram)).toBe('ram_requires_lateral_geometry');
});
it('rolls fatality/injury only on newly disabled living targets and destruction only on chariots', () => {
  const f = setup(); const w = f.content.weapons.find(w => w.id === 'short-sword')!; w.minDamage = 1000; w.maxDamage = 1000; w.eligibleTargets = ['driver']; w.targetWeights = { driver: 1, beast: 0, chariot: 0 };
  const lethal = f.content.lethalityProfiles.find(p => p.id === f.scenario.lethalityProfileId)!; lethal.fatalityChance = 1; lethal.severeInjuryChance = 1; lethal.destructionChance = 1;
  const h = harness(f); h.resolve([sword]); expect(h.state.ruStates['ru-iron']!.driver).toMatchObject({ dead: true, destroyed: false, injuries: ['severe-injury'] });
  h.resolve([sword]); expect(h.events.filter(e => e.type === 'component_disabled')).toHaveLength(1);
  w.eligibleTargets = ['chariot']; w.targetWeights = { chariot: 1, beast: 0, driver: 0 };
  const c = harness(f); c.resolve([sword]); expect(c.state.ruStates['ru-iron']!.chariot).toMatchObject({ dead: false, destroyed: true });
});
it('disables one individual beast without disabling a remaining healthy team', () => {
  const f = setup(); const w = f.content.weapons.find(w => w.id === 'short-sword')!; w.minDamage = 1000; w.maxDamage = 1000; w.eligibleTargets = ['beast']; w.targetWeights = { driver: 0, beast: 1, chariot: 0 };
  const h = harness(f); h.resolve([sword]); expect(h.state.ruStates['ru-iron']!.beasts.filter(b => b.health === 0)).toHaveLength(1); expect(h.state.ruStates['ru-iron']!.status).toBe('active');
});
it('preMove disablement cancels later movement and postMove attacks in the integrated engine', () => {
  const f = setup(); const w = f.content.weapons.find(w => w.id === 'short-bow')!; w.minDamage = 1000; w.maxDamage = 1000; w.eligibleTargets = ['driver']; w.targetWeights = { driver: 1, beast: 0, chariot: 0 };
  f.scenario.startingGrid['ru-iron'] = { segmentId: 'seg-01', lane: 0 }; f.scenario.gridRows = f.scenario.gridRows.map(row => ({ ...row, ruIds: row.ruIds.filter(id => id !== 'ru-iron') })); f.scenario.gridRows.push({ id: 'bow-target', segmentId: 'seg-01', ruIds: ['ru-iron'] });
  f.scenario.combatPlans = [{ ...bow, movementTick: 1 }, { ...sword, ruId: 'ru-iron', targetRuId: 'ru-ash', movementTick: 1 }];
  const engine = createMovementEngine(f.scenario, f.content); const step = engine.step(); expect(step.state.phase).not.toBe('error');
  expect(step.state.ruStates['ru-iron']).toMatchObject({ status: 'disabled', progressInSegment: 0, speedMps: 0 });
  expect(step.events.some(e => e.type === 'movement_transition' && e.ruId === 'ru-iron')).toBe(false);
});
it('revalidates escaped postMove targets with configurable cancellation cost', () => {
  for (const consumes of [false, true]) {
    const f = setup(); f.content.tuningProfiles[0]!.combat.cancelConsumesCooldown = consumes;
    const h = harness(f); h.state.ruStates['ru-iron']!.tile = { segmentId: 'seg-01', lane: 0 }; h.resolve([sword]);
    expect(h.state.ruStates['ru-player']!.cooldowns.driver).toBe(consumes ? 5 : 0);
  }
});
it('supports tunable bands and guarantees minimum damage under heavy protection', () => {
  const f = setup(); const w = f.content.weapons.find(w => w.id === 'short-sword')!; w.minDamage = 1; w.maxDamage = 1; w.eligibleTargets = ['driver']; w.targetWeights = { driver: 1, beast: 0, chariot: 0 };
  f.content.drivers.find(d => d.id === 'driver-iron')!.currentHealth = 71;
  const h = harness(f); h.resolve([sword]); expect(h.state.ruStates['ru-iron']!.driver).toMatchObject({ health: 70, band: 'damaged' });
});
it('AI Attack raises legal attack utility, Defend raises guard utility, unseen changes cannot alter candidates', () => {
  const f = setup(); f.scenario.controller = 'ai'; const h = harness(f);
  planCombat(h.config, h.state, 1, () => {}, []); const before = copyJson(h.state.ruStates['ru-player']!.combatDecision!);
  h.state.ruStates['ru-player']!.activeSignId = 'attack'; planCombat(h.config, h.state, 1, () => {}, []);
  const attack = h.state.ruStates['ru-player']!.combatDecision!; expect(attack.candidates.find(c => c.weaponId === 'short-sword')!.utility).toBeGreaterThan(before.candidates.find(c => c.weaponId === 'short-sword')!.utility);
  expect(attack.selected.length).toBeGreaterThan(0);
  h.state.ruStates['ru-player']!.activeSignId = 'defend-position'; planCombat(h.config, h.state, 1, () => {}, []); expect(h.state.ruStates['ru-player']!.combatDecision!.guardUtility).toBeGreaterThan(before.guardUtility);
  h.state.ruStates['ru-iron']!.tile.segmentId = 'seg-20'; planCombat(h.config, h.state, 1, () => {}, []); const unseen = copyJson(h.state.ruStates['ru-player']!.combatDecision);
  h.state.ruStates['ru-iron']!.driver.health = 1; h.state.ruStates['ru-iron']!.speedMps = 100; planCombat(h.config, h.state, 1, () => {}, []); expect(h.state.ruStates['ru-player']!.combatDecision).toEqual(unseen);
});
it('validates versioned combat references, slot uniqueness, tuning bounds and fixture ownership', () => {
  const f = setup(); f.scenario.combatPlans = [{ ...sword, movementTick: 1 }, { ...sword, movementTick: 1 }]; expect(() => validateSetup(f.scenario, f.content)).toThrow();
  f.scenario.combatPlans.pop(); f.scenario.controller = 'ai'; expect(() => validateSetup(f.scenario, f.content)).toThrow();
  f.scenario.controller = 'fixture'; f.content.tuningProfiles[0]!.combat.hitMin = 1; f.content.tuningProfiles[0]!.combat.hitMax = 0; expect(() => validateSetup(f.scenario, f.content)).toThrow();
});
it('replays raw and race combat state, RNG and reordered definitions exactly', () => {
  const f = setup(); f.scenario.combatPlans = [{ ...sword, movementTick: 1 }];
  const raw = createMovementEngine(f.scenario, f.content); raw.step(); expect(replayMovement(JSON.parse(raw.exportBundle())).latest()).toEqual(raw.latest());
  const race = createRaceEngine(f.scenario, f.content); race.step(); expect(replayRace(JSON.parse(race.exportBundle())).latest()).toEqual(race.latest());
  const reordered = copyJson(f); reordered.scenario.entries.reverse(); reordered.content.weapons.reverse(); const other = createRaceEngine(reordered.scenario, reordered.content); other.step(); expect(other.latest()).toEqual(race.latest());
});
it('terminates 1000 compact seeded combat races without occupancy, cooldown or component violations', () => {
  const f = setup(); f.scenario.controller = 'ai'; f.scenario.rules.maxTicks = 3;
  f.scenario.entries = f.scenario.entries.slice(0, 3); const ids = f.scenario.entries.map(entry => entry.id);
  f.scenario.startingGrid = Object.fromEntries(ids.map((id, lane) => [id, { segmentId: 'seg-00', lane }]));
  f.scenario.gridRows = [{ id: 'front', segmentId: 'seg-00', ruIds: ids }];
  f.scenario.targetSpeedRatios = Object.fromEntries(ids.map(id => [id, 1]));
  const track = f.content.tracks[0]!; track.segments = track.segments.slice(0, 4);
  track.segments[3]!.lanes.forEach(lane => { lane.next.segmentId = 'seg-00'; });
  f.content.tuningProfiles[0]!.combat.hitMin = .05; f.content.tuningProfiles[0]!.combat.hitMax = .95;
  f.scenario.entries.forEach(entry => { entry.preRaceStrategy = 'aggressive'; });
  for (let seed = 0; seed < 1000; seed++) {
    f.scenario.seed = `combat-${seed}`;
    const engine = createRaceEngine(f.scenario, f.content); engine.runUntilComplete(); expect(engine.snapshot().phase).toBe('complete');
    assertRaceState(copyJson(engine.snapshot())); assertCombatState(engine.initialConfiguration, engine.snapshot());
  }
}, 60000);

it('logs the configured skill hit formula, guard penalty and bounds on a miss', () => {
  const f = setup(); const t = f.content.tuningProfiles[0]!.combat; t.hitMin = 0; t.hitMax = 0;
  const h = harness(f); h.resolve([sword], 'postMove', new Set(['ru-iron']));
  const miss = h.events.find(e => e.type === 'attack_miss'); expect(miss?.type === 'attack_miss' && miss.details.chance).toBe(0);
  // With no clamping and a forced hit, inspect the exact base/skill/guard formula.
  t.hitMin = 0; t.hitMax = 1;
  let observed = false;
  for (let seed = 0; seed < 20 && !observed; seed++) {
    f.scenario.seed = `formula-${seed}`; const x = harness(f); x.resolve([sword], 'postMove', new Set(['ru-iron']));
    const hit = x.events.find(e => e.type === 'attack_hit');
    if (hit?.type === 'attack_hit') { expect(hit.details.chance).toBeCloseTo(.55 + .003 * (65 - 50) - .002 * (60 - 50) - .2); observed = true; }
  }
  expect(observed).toBe(true);
});
it('executes explicitly equipped mounted actions without occupying the driver channel', () => {
  const f = setup(); const mounted = { ...f.content.weapons[0]!, id: 'mounted-test', channel: 'mounted' as const };
  // Source array order is not semantic; choose the known melee geometry.
  Object.assign(mounted, f.content.weapons.find(w => w.id === 'short-sword'), { id: 'mounted-test', channel: 'mounted' });
  f.content.weapons.push(mounted); f.content.chariots.find(c => c.id === 'chariot-player')!.equipmentIds.push(mounted.id);
  const h = harness(f); h.resolve([{ ...sword, weaponId: mounted.id }, sword]);
  expect(h.state.ruStates['ru-player']!.cooldowns.mounted).toBe(5); expect(h.state.ruStates['ru-player']!.cooldowns.driver).toBe(5);
  expect(h.events.filter(e => e.type === 'attack_hit')).toHaveLength(2);
});
it('a planned postMove target can escape during actual movement without consuming readiness', () => {
  const f = setup(); f.scenario.targetSpeedRatios['ru-player'] = 0;
  f.content.tuningProfiles[0]!.tickDurationSeconds = 1; f.content.tuningProfiles[0]!.stats.acceleration.base = 100;
  f.content.tracks[0]!.segments.forEach(segment => { segment.meters = 1; });
  f.scenario.combatPlans = [{ ...sword, movementTick: 1 }]; const engine = createMovementEngine(f.scenario, f.content); const frame = engine.step();
  expect(frame.state.phase).not.toBe('error'); expect(frame.state.ruStates['ru-iron']!.tile.segmentId).not.toBe('seg-00');
  expect(frame.events.some(e => e.type === 'attack_rejected' && e.details.phase === 'postMove')).toBe(true);
  expect(frame.state.ruStates['ru-player']!.cooldowns.driver).toBe(0);
});
