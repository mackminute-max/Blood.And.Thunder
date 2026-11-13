import { z } from 'zod';
import { commandSchema } from './commands.ts';
import { idSchema } from './ids.ts';

export const SCHEMA_VERSION = 'c2-1' as const;
export const SIMULATION_VERSION = '0.8.0' as const;
const id = idSchema;
const finite = z.number().finite();
const stat = finite.min(0).max(100);
const count = z.number().int().nonnegative();
const positive = finite.positive();
const ids = z.array(id);
const version = z.literal(SCHEMA_VERSION);
const named = { id, name: z.string().min(1) };
const health = { maxHealth: positive, currentHealth: finite.nonnegative() };
const healthCheck = (value: { currentHealth: number; maxHealth: number }) => value.currentHealth <= value.maxHealth;
export const tileSchema = z.strictObject({ segmentId: id, lane: count.max(15) });
const laneSchema = z.strictObject({
  index: count.max(15), lengthMultiplier: positive, cornerSpeedFactor: positive,
  traction: positive, roughness: finite.nonnegative(), next: tileSchema,
  lateralNeighbors: z.array(count.max(15)),
});
const segmentSchema = z.strictObject({
  id, order: count, kind: z.enum(['straight', 'corner', 'transition']),
  turn: z.enum(['none', 'left', 'right']), severity: finite.nonnegative(), meters: positive,
  lanes: z.array(laneSchema).min(1).max(16), startFinishBoundary: z.boolean(),
});
const trackSchema = z.strictObject({ schemaVersion: version, ...named, segments: z.array(segmentSchema).min(2) });
const beastSchema = z.strictObject({
  ...named, speciesId: id, speed: stat, power: stat, agility: stat, endurance: stat,
  discipline: stat, toughness: stat, ...health, traits: ids, naturalAttackIds: ids,
}).refine(healthCheck, { path: ['currentHealth'], message: 'Health exceeds maxHealth' });
const chariotSchema = z.strictObject({
  ...named, weightKg: positive, stability: stat, durability: stat, protection: stat,
  rollingEfficiency: stat, maneuverability: stat, capacitySlots: count,
  ...health, equipmentIds: ids,
}).refine(healthCheck, { path: ['currentHealth'], message: 'Health exceeds maxHealth' });
const driverSchema = z.strictObject({
  ...named, driving: stat, beastHandling: stat, combat: stat, awareness: stat, nerve: stat,
  personality: z.strictObject({ aggression: stat, riskTolerance: stat, patience: stat, competitiveness: stat, discipline: stat }),
  ...health,
}).refine(healthCheck, { path: ['currentHealth'], message: 'Health exceeds maxHealth' });
const weaponSchema = z.strictObject({
  ...named, channel: z.enum(['driver', 'beast', 'mounted', 'ram']),
  rangeSegments: count, rangeMode: z.enum(['sameSegmentAdjacentLane', 'forwardTile', 'adjacentTile', 'segmentDistance']),
  allowedArcs: z.array(z.enum(['front', 'side', 'rear'])).min(1),
  eligibleTargets: z.array(z.enum(['driver', 'beast', 'chariot'])).min(1),
  accuracyBase: finite.min(0).max(1), minDamage: count.max(1000000000), maxDamage: count.max(1000000000), targetWeights: z.strictObject({ driver: finite.nonnegative(), beast: finite.nonnegative(), chariot: finite.nonnegative() }),
  cooldownTicks: count.positive(), timing: z.enum(['preMove', 'postMove', 'contact']),
}).superRefine((value, ctx) => {
  if (value.eligibleTargets.reduce((sum, kind) => sum + value.targetWeights[kind], 0) <= 0) ctx.addIssue({ code: 'custom', path: ['targetWeights'], message: 'Eligible target weights require positive sum' });
  if (value.minDamage > value.maxDamage) ctx.addIssue({ code: 'custom', path: ['maxDamage'], message: 'Must be >= minDamage' });
  if ((value.channel === 'ram') !== (value.timing === 'contact')) ctx.addIssue({ code: 'custom', path: ['timing'], message: 'Contact timing is reserved for ram channel' });
  if (value.rangeMode === 'sameSegmentAdjacentLane' && value.rangeSegments !== 0) ctx.addIssue({ code: 'custom', path: ['rangeSegments'], message: 'Same-segment range must be zero' });
  if (value.channel === 'ram' && (value.rangeMode !== 'sameSegmentAdjacentLane' || value.allowedArcs.some(arc => arc !== 'side'))) ctx.addIssue({ code: 'custom', path: ['allowedArcs'], message: 'Routine rams must be lateral only' });
  if (value.timing === 'preMove' && value.rangeMode !== 'segmentDistance') ctx.addIssue({ code: 'custom', path: ['timing'], message: 'PreMove is reserved for ranged segment-distance actions' });
  if (value.channel === 'beast' && value.timing !== 'postMove') ctx.addIssue({ code: 'custom', path: ['timing'], message: 'A1 beast definitions require postMove timing' });
});
const factors = z.strictObject({ damaged: finite.min(0).max(1), critical: finite.min(0).max(1), disabled: finite.min(0).max(1) });
const bounds = { min: positive, max: positive };
const weights = z.strictObject({ beast: finite.nonnegative(), chariot: finite.nonnegative(), driver: finite.nonnegative(), beastHandling: finite.nonnegative() });
const statsSchema = z.strictObject({
  conditionFactors: factors,
  coordination: z.strictObject({ base: finite.nonnegative(), gain: finite.nonnegative(), ...bounds }),
  teamPower: z.strictObject({ referenceTeamSize: positive, cap: positive }),
  load: z.strictObject({ referenceKg: positive, divisor: positive, ...bounds }),
  fatigue: z.strictObject({ divisor: positive, ...bounds }),
  damage: z.strictObject({ divisor: positive, ...bounds, beastWeight: finite.nonnegative(), chariotWeight: finite.nonnegative(), driverWeight: finite.nonnegative() }),
  speed: z.strictObject({ base: finite.nonnegative(), perTeamSpeed: finite.nonnegative(), rollingBase: finite.nonnegative(), rollingScale: finite.nonnegative() }),
  acceleration: z.strictObject({ base: finite.nonnegative(), perTeamPower: finite.nonnegative() }),
  braking: z.strictObject({ base: finite.nonnegative(), perTeamAgility: finite.nonnegative(), perDriving: finite.nonnegative(), tractionMin: positive, tractionMax: positive }),
  handling: weights, stability: weights, endurance: weights,
}).superRefine((value, ctx) => {
  for (const key of ['coordination', 'load', 'fatigue', 'damage'] as const) if (value[key].min > value[key].max) ctx.addIssue({ code: 'custom', path: [key], message: 'Minimum must not exceed maximum' });
  if (value.braking.tractionMin > value.braking.tractionMax) ctx.addIssue({ code: 'custom', path: ['braking'], message: 'Traction bounds must increase' });
  if (value.damage.beastWeight + value.damage.chariotWeight + value.damage.driverWeight === 0) ctx.addIssue({ code: 'custom', path: ['damage'], message: 'Damage weights must have positive sum' });
});
const speedModes = z.strictObject({ push: finite, cruise: finite, conserve: finite, brake: finite });
const aiSchema = z.strictObject({
  base: finite, progressWeight: finite, overtakeWeight: finite, collisionWeight: finite, fatigueWeight: finite, cornerWeight: finite,
  noise: finite.nonnegative(), commitmentTicks: count.positive(), switchPenalty: finite.nonnegative(),
  awarenessBase: count, awarenessDivisor: positive, behindRange: count,
  baseExertionCost: finite.nonnegative(), aggressionRisk: finite, riskToleranceRisk: finite, patienceConserve: finite, competitiveOvertake: finite, disciplineSign: finite,
  speedRatios: speedModes.refine(value => Object.values(value).every(ratio => ratio >= 0 && ratio <= 1), 'Speed ratios must be in [0,1]'),
  safetyCollisionRisk: finite.min(0).max(1), safetyOverspeedRatio: positive,
  strategies: z.strictObject({ balanced: speedModes, aggressive: speedModes, defensive: speedModes, endurance: speedModes, sprint: speedModes, opportunistic: speedModes }),
  signs: z.strictObject({ 'push-hard': speedModes, 'defend-position': speedModes, attack: speedModes, conserve: speedModes }),
  pushFatigueMultiplier: positive, pushOvertake: finite, defendStay: finite, defendRisk: finite, opportunisticOvertake: finite,
});
const tuningSchema = z.strictObject({
  schemaVersion: version, ...named, tickDurationSeconds: positive,
  condition: z.strictObject({ criticalMaxPercent: stat, damagedMaxPercent: stat }),
  stats: statsSchema, ai: aiSchema,
  attributes: z.strictObject({ nerveAvoidancePerPoint: finite.min(0).max(.01), durabilityPerPoint: finite.min(0).max(.01), durabilityReference: stat, roughnessTractionWeight: finite.min(0).max(1), severitySpeedWeight: finite.min(0).max(1), severityReference: finite.nonnegative() }).default({ nerveAvoidancePerPoint: .001, durabilityPerPoint: .002, durabilityReference: 70, roughnessTractionWeight: .2, severitySpeedWeight: .15, severityReference: 1 }),
  environment: z.strictObject({
    traitModifiers: z.array(z.strictObject({ traitId: id, weatherIds: ids, tractionMultiplier: positive, fatigueMultiplier: positive })),
    fatigue: z.strictObject({ basePerSecond: finite.nonnegative(), exertionBase: finite.nonnegative(), speedWeight: finite.nonnegative(), accelerationWeight: finite.nonnegative(), accelerationDivisor: positive, exertionMin: finite.nonnegative(), exertionMax: positive, enduranceBase: positive, enduranceDivisor: positive, recoverySpeedRatio: finite.min(0).max(1), recoveryPerSecond: finite.nonnegative() }),
    events: z.strictObject({ rates: z.strictObject({ disabled: z.literal(0), rare: finite.min(0).max(10), occasional: finite.min(0).max(10), frequent: finite.min(0).max(10), chaotic: finite.min(0).max(10) }), maxEvents: count.max(3), windowStart: finite.min(0).max(1), windowEnd: finite.min(0).max(1), spacingTicks: count.positive(), placementBufferSegments: count, earlyWreckClear: z.boolean(), earlyWreckClearBlockedTicks: count.positive(), animalStepTicks: count.positive(), roughnessTractionDelta: finite.min(-1).max(0), memoryTicks: count.positive(), hazardUtilityPenalty: finite.nonnegative(),
      weights: z.strictObject({ debris_spawn: finite.nonnegative(), track_roughness: finite.nonnegative(), animal_crossing: finite.nonnegative() }), durations: z.strictObject({ debris_spawn: count.positive(), track_roughness: count.positive(), animal_crossing: count.positive() }) }),
    collision: z.strictObject({ enabled: z.boolean(), avoidanceBase: finite.min(0).max(1), handlingDivisor: positive, awarenessDivisor: positive, skillCenter: stat, avoidanceMin: finite.min(0).max(1), avoidanceMax: finite.min(0).max(1), minimumClosingSpeed: finite.nonnegative(), lateralRelativeSpeed: finite.nonnegative(), damage: z.strictObject({ minor: count, moderate: count, major: count }), stabilityDivisor: positive }),
  }),
  combat: z.strictObject({
    hitMin: finite.min(0).max(1), hitMax: finite.min(0).max(1), attackSkillCoefficient: finite.nonnegative(), defenseSkillCoefficient: finite.nonnegative(), skillCenter: stat,
    visibilityPenalty: finite.nonnegative(), positionalBonus: finite, guardReduction: finite.min(0).max(1), defenseCooldownTicks: count.positive(), protectionDivisor: positive, minimumDamage: count.positive(),
    cancelConsumesCooldown: z.boolean(), diagonalRanged: z.boolean(), rangedRuOcclusion: z.boolean(), guardAllowsDriverAttack: z.boolean(), beastSkillStat: z.enum(['discipline', 'power', 'agility']),
    ramWeaponId: id, beastMassEquivalentKg: positive, ramLateralSpeedMps: finite.nonnegative(), minorImpactEnergy: positive, majorImpactEnergy: positive,
    impactSpeedFactor: z.strictObject({ minor: finite.min(0).max(1), moderate: finite.min(0).max(1), major: finite.min(0).max(1) }),
    impactDamageFactor: z.strictObject({ minor: finite.nonnegative(), moderate: finite.nonnegative(), major: finite.nonnegative() }),
    ai: z.strictObject({ attackBase: finite, noneUtility: finite, aggression: finite, riskCost: finite, cooldownCost: finite, noise: finite.nonnegative(), attackSign: finite, ramSign: finite, aggressiveStrategy: finite, opportunisticStrategy: finite, defensivePenalty: finite, guardBase: finite, guardThreat: finite, guardRisk: finite, defendStrategy: finite, defendSign: finite, guardAttackPenalty: finite })
  }),
  movement: z.strictObject({ maxTransitionsPerTick: count.positive().max(10000), arrivalEpsilon: positive.max(0.001), respectSafeCornerSpeed: z.boolean(),
    handling: z.strictObject({ favorableTraction: positive, favorableHandling: stat, tractionScoreWeight: finite.nonnegative(), overspeedScoreWeight: finite.nonnegative(), probabilityBase: finite.min(0).max(1), scoreCenter: stat, scoreDivisor: positive, minProbability: finite.min(0).max(1), maxProbability: finite.min(0).max(1), failureSpeedFactor: finite.min(0).max(1), cornerTractionMin: positive, cornerTractionMax: positive, cornerHandlingBase: finite.nonnegative(), cornerHandlingScale: finite.nonnegative() }),
    conflict: z.strictObject({ brakeFactor: finite.min(0).max(1), deadlockWarningTicks: count.positive(), deadlockRecoveryTicks: count.positive() }) }),
}).refine(value => value.condition.criticalMaxPercent < value.condition.damagedMaxPercent, { path: ['condition'], message: 'Condition thresholds must increase' }).superRefine((value, ctx) => {
  const e = value.environment;
  if (e.fatigue.exertionMin > e.fatigue.exertionMax || e.fatigue.enduranceBase < 100 / e.fatigue.enduranceDivisor || e.events.windowStart >= e.events.windowEnd || e.collision.avoidanceMin > e.collision.avoidanceMax || Object.values(e.events.weights).reduce((a, b) => a + b, 0) <= 0) ctx.addIssue({ code: 'custom', path: ['environment'], message: 'Environment bounds/weights are invalid' });
  if (value.combat.hitMin > value.combat.hitMax || value.combat.minorImpactEnergy >= value.combat.majorImpactEnergy) ctx.addIssue({ code: 'custom', path: ['combat'], message: 'Combat probability/energy bounds must increase' });
  if (value.movement.handling.minProbability > value.movement.handling.maxProbability || value.movement.handling.cornerTractionMin > value.movement.handling.cornerTractionMax) ctx.addIssue({ code: 'custom', path: ['movement', 'handling'], message: 'Handling bounds must increase' });
  if (value.movement.conflict.deadlockWarningTicks >= value.movement.conflict.deadlockRecoveryTicks) ctx.addIssue({ code: 'custom', path: ['movement', 'conflict'], message: 'Warning must precede recovery' });
});
export const contentSchema = z.strictObject({
  schemaVersion: version,
  tracks: z.array(trackSchema).min(1), beasts: z.array(beastSchema).min(1),
  chariots: z.array(chariotSchema).min(1), drivers: z.array(driverSchema).min(1), weapons: z.array(weaponSchema),
  speciesIds: ids, traitIds: ids,
  weather: z.array(z.strictObject({ ...named, traction: positive, visibility: positive, fatigue: positive })).min(1),
  lethalityProfiles: z.array(z.strictObject({ ...named, severeInjuryChance: finite.min(0).max(1), fatalityChance: finite.min(0).max(1), destructionChance: finite.min(0).max(1) })).min(1),
  tuningProfiles: z.array(tuningSchema).min(1),
});
export const scenarioSchema = z.strictObject({
  schemaVersion: version, simulationVersion: z.literal(SIMULATION_VERSION), ...named,
  seed: z.string().min(1).refine(value => value.trim().length > 0, 'Seed must not be blank'),
  controller: z.enum(['fixture', 'ai']),
  mode: z.enum(['interactive', 'headless']), trackId: id,
  entries: z.array(z.strictObject({
    ...named, isPlayer: z.boolean(), driverId: id, chariotId: id, beastIds: ids.min(1),
    preRaceStrategy: z.enum(['balanced', 'aggressive', 'defensive', 'endurance', 'sprint', 'opportunistic']), weaponIds: ids,
  })).min(1),
  startingGrid: z.record(id, tileSchema),
  combatPlans: z.array(z.strictObject({ movementTick: count.positive(), ruId: id, targetRuId: id, weaponId: id })),
  environmentPlans: z.array(z.strictObject({ id, movementTick: count.positive(), type: z.enum(['debris_spawn', 'track_roughness', 'animal_crossing']), tile: tileSchema, durationTicks: count.positive() })),
  guardPlans: z.array(z.strictObject({ movementTick: count.positive(), ruId: id })),
  maneuvers: z.array(z.strictObject({ movementTick: count.positive(), ruId: id, laneDelta: z.union([z.literal(-1), z.literal(1)]), abortIfBlocked: z.boolean() })),
  targetSpeedRatios: z.record(id, finite.min(0).max(1)),
  gridRows: z.array(z.strictObject({ id, segmentId: id, ruIds: ids.min(1) })).min(1),
  weatherId: id, eventIntensity: z.enum(['disabled', 'rare', 'occasional', 'frequent', 'chaotic']),
  lethalityProfileId: id, tuningProfileId: id,
  rules: z.strictObject({
    competitionStyle: z.enum(['combat', 'pure']).default('combat'),
    format: z.literal('circuit'), countdownTicks: count.max(10000), finishTieToleranceSeconds: finite.min(0).max(0.001), laps: count.positive(), maxTicks: count.positive(),
    finishCutoffTicks: count, disabledRemovalTicks: count,
    combatAllowed: z.boolean(), beastTargetingAllowed: z.boolean(),
    maxSignOpportunities: count, allowDeveloperSignCommands: z.boolean(), maxCommandSubmissions: count.positive().max(100000), allowStationaryLaneChange: z.boolean(),
  }),
  scriptedCommands: z.array(commandSchema),
});
export type RaceScenario = z.infer<typeof scenarioSchema>;
export type ContentRegistry = z.infer<typeof contentSchema>;
export type TileRef = z.infer<typeof tileSchema>;
