import { contentSchema, scenarioSchema } from './schemas.ts';
import type { ContentRegistry, RaceScenario } from './schemas.ts';

export interface ValidationIssue { path: string; message: string }
export class SetupValidationError extends Error {
  readonly issues: readonly ValidationIssue[];
  constructor(issues: ValidationIssue[]) {
    super(issues.map(issue => `${issue.path}: ${issue.message}`).join('\n'));
    this.name = 'SetupValidationError';
    this.issues = Object.freeze(issues.map(issue => Object.freeze({ ...issue })));
  }
}
export function validateSetup(scenarioInput: unknown, contentInput: unknown): { scenario: RaceScenario; content: ContentRegistry } {
  const scenarioResult = scenarioSchema.safeParse(scenarioInput);
  const contentResult = contentSchema.safeParse(contentInput);
  const issues: ValidationIssue[] = [];
  const issue = (path: string, message: string) => { issues.push({ path, message }); };
  for (const [prefix, result] of [['scenario', scenarioResult], ['content', contentResult]] as const) {
    if (!result.success) for (const error of result.error.issues) issue(`${prefix}.${error.path.join('.')}`, error.message);
  }
  if (!scenarioResult.success || !contentResult.success) throw new SetupValidationError(issues);
  const scenario = scenarioResult.data;
  const content = contentResult.data;
  const unique = (values: (string | number)[], path: string) => {
    const seen = new Set<string | number>();
    for (const value of values) {
      if (seen.has(value)) issue(path, `Duplicate value ${value}`);
      seen.add(value);
    }
  };
  const reference = (value: string, valid: Set<string>, path: string) => {
    if (!valid.has(value)) issue(path, `Unknown reference ${value}`);
  };
  const catalogs = ['tracks', 'beasts', 'chariots', 'drivers', 'weapons', 'weather', 'lethalityProfiles', 'tuningProfiles'] as const;
  const catalogIds = Object.fromEntries(catalogs.map(key => {
    const values = content[key].map(item => item.id);
    unique(values, `content.${key}`);
    return [key, new Set(values)];
  })) as Record<typeof catalogs[number], Set<string>>;
  unique(content.speciesIds, 'content.speciesIds');
  unique(content.traitIds, 'content.traitIds');
  content.beasts.forEach((beast, index) => {
    const path = `content.beasts.${index}`;
    reference(beast.speciesId, new Set(content.speciesIds), `${path}.speciesId`);
    unique(beast.traits, `${path}.traits`);
    unique(beast.naturalAttackIds, `${path}.naturalAttackIds`);
    beast.traits.forEach(value => reference(value, new Set(content.traitIds), `${path}.traits`));
    beast.naturalAttackIds.forEach(value => {
      reference(value, catalogIds.weapons, `${path}.naturalAttackIds`);
      if (content.weapons.find(weapon => weapon.id === value)?.channel !== 'beast') issue(`${path}.naturalAttackIds`, 'Natural attack must use beast channel');
    });
  });
  content.chariots.forEach((chariot, index) => {
    unique(chariot.equipmentIds, `content.chariots.${index}.equipmentIds`);
    chariot.equipmentIds.forEach(value => reference(value, catalogIds.weapons, `content.chariots.${index}.equipmentIds`));
    if (chariot.equipmentIds.length > chariot.capacitySlots) issue(`content.chariots.${index}.equipmentIds`, 'Equipment exceeds capacity');
  });
  content.tracks.forEach((track, trackIndex) => {
    const path = `content.tracks.${trackIndex}`;
    unique(track.segments.map(segment => segment.id), `${path}.segments`);
    unique(track.segments.map(segment => segment.order), `${path}.segments.order`);
    const segments = [...track.segments].sort((a, b) => a.order - b.order);
    if (segments.some((segment, index) => segment.order !== index)) issue(`${path}.segments.order`, 'Order must be contiguous from zero');
    if (segments.filter(segment => segment.startFinishBoundary).length !== 1) issue(`${path}.segments`, 'Circuit requires one start/finish boundary');
    segments.forEach((segment, index) => {
      const segmentPath = `${path}.segments.${track.segments.indexOf(segment)}`;
      unique(segment.lanes.map(lane => lane.index), `${segmentPath}.lanes`);
      if ([...segment.lanes].sort((a, b) => a.index - b.index).some((lane, laneIndex) => lane.index !== laneIndex)) issue(`${segmentPath}.lanes`, 'Lane indices must be contiguous from zero');
      const nextSegment = segments[(index + 1) % segments.length];
      segment.lanes.forEach(lane => {
        const lanePath = `${segmentPath}.lanes.${segment.lanes.indexOf(lane)}`;
        if (lane.next.segmentId !== nextSegment?.id || !nextSegment.lanes.some(next => next.index === lane.next.lane)) issue(`${lanePath}.next`, 'Forward connection must reach a valid tile in next ordered segment');
        unique(lane.lateralNeighbors, `${lanePath}.lateralNeighbors`);
        lane.lateralNeighbors.forEach(neighbor => {
          const target = segment.lanes.find(candidate => candidate.index === neighbor);
          if (Math.abs(neighbor - lane.index) !== 1 || !target?.lateralNeighbors.includes(lane.index)) issue(`${lanePath}.lateralNeighbors`, 'Lateral links must be adjacent, valid, and reciprocal');
        });
      });
    });

  });
  reference(scenario.trackId, catalogIds.tracks, 'scenario.trackId');
  reference(scenario.weatherId, catalogIds.weather, 'scenario.weatherId');
  reference(scenario.lethalityProfileId, catalogIds.lethalityProfiles, 'scenario.lethalityProfileId');
  reference(scenario.tuningProfileId, catalogIds.tuningProfiles, 'scenario.tuningProfileId');
  unique(scenario.entries.map(entry => entry.id), 'scenario.entries');
  const players = scenario.entries.filter(entry => entry.isPlayer).length;
  if ((scenario.mode === 'interactive' && players !== 1) || players > 1) issue('scenario.entries', 'Interactive scenarios require exactly one player; headless scenarios permit at most one');
  const assigned = { beasts: [] as string[], drivers: [] as string[], chariots: [] as string[] };
  scenario.entries.forEach((entry, index) => {
    const path = `scenario.entries.${index}`;
    reference(entry.driverId, catalogIds.drivers, `${path}.driverId`);
    reference(entry.chariotId, catalogIds.chariots, `${path}.chariotId`);
    entry.beastIds.forEach(value => reference(value, catalogIds.beasts, `${path}.beastIds`));
    entry.weaponIds.forEach(value => reference(value, catalogIds.weapons, `${path}.weaponIds`));
    unique(entry.weaponIds, `${path}.weaponIds`);
    assigned.drivers.push(entry.driverId); assigned.chariots.push(entry.chariotId); assigned.beasts.push(...entry.beastIds);
  });
  for (const key of ['beasts', 'drivers', 'chariots'] as const) unique(assigned[key], `scenario.entries.${key}`);
  const ruIds = new Set(scenario.entries.map(entry => entry.id));
  for (const ruId of ruIds) if (!Object.hasOwn(scenario.targetSpeedRatios, ruId)) issue(`scenario.targetSpeedRatios.${ruId}`, 'Missing pre-race movement target');
  for (const ruId of Object.keys(scenario.targetSpeedRatios)) reference(ruId, ruIds, `scenario.targetSpeedRatios.${ruId}`);
  scenario.targetSpeedRatios = Object.fromEntries(Object.entries(scenario.targetSpeedRatios).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  if (scenario.controller === 'ai' && scenario.maneuvers.length) issue('scenario.maneuvers', 'Developer maneuver plans require fixture controller');
  unique(scenario.maneuvers.map(plan => `${plan.movementTick}:${plan.ruId}`), 'scenario.maneuvers');
  scenario.maneuvers.forEach((plan, index) => {
    reference(plan.ruId, ruIds, `scenario.maneuvers.${index}.ruId`);
    if (plan.movementTick > scenario.rules.maxTicks) issue(`scenario.maneuvers.${index}.movementTick`, 'Maneuver exceeds race movement tick limit');
  });
  scenario.maneuvers.sort((a, b) => a.movementTick - b.movementTick || (a.ruId < b.ruId ? -1 : a.ruId > b.ruId ? 1 : 0));
  unique(scenario.scriptedCommands.map(command => command.commandId), 'scenario.scriptedCommands');
  scenario.scriptedCommands.forEach((command, index) => {
    reference(command.ruId, ruIds, `scenario.scriptedCommands.${index}.ruId`);
    if (command.effectiveTick > scenario.rules.maxTicks + scenario.rules.countdownTicks) issue(`scenario.scriptedCommands.${index}.effectiveTick`, 'Command exceeds race horizon');
  });
  if (scenario.scriptedCommands.length > scenario.rules.maxCommandSubmissions) issue('scenario.scriptedCommands', 'Too many scripted commands');
  for (const profile of content.tuningProfiles) {
    unique(profile.environment.traitModifiers.map(modifier => modifier.traitId), 'environment.traitModifiers');
    for (const modifier of profile.environment.traitModifiers) { reference(modifier.traitId, new Set(content.traitIds), 'environment.traitModifiers.traitId'); for (const weatherId of modifier.weatherIds) reference(weatherId, catalogIds.weather, 'environment.traitModifiers.weatherIds'); }
    reference(profile.combat.ramWeaponId, catalogIds.weapons, `content.tuningProfiles.${profile.id}.combat.ramWeaponId`);
    if (content.weapons.find(weapon => weapon.id === profile.combat.ramWeaponId)?.channel !== 'ram') issue(`content.tuningProfiles.${profile.id}.combat.ramWeaponId`, 'Ram definition must use ram channel');
  }
  if (scenario.controller === 'ai' && (scenario.combatPlans.length || scenario.guardPlans.length)) issue('scenario.combatPlans', 'Combat/guard fixture plans require fixture controller');
  unique(scenario.environmentPlans.map(plan => plan.id), 'scenario.environmentPlans');
  scenario.environmentPlans.forEach((plan, index) => {
    const track = content.tracks.find(track => track.id === scenario.trackId);
    if (!track?.segments.find(segment => segment.id === plan.tile.segmentId)?.lanes.some(lane => lane.index === plan.tile.lane)) issue(`scenario.environmentPlans.${index}.tile`, 'Invalid hazard tile');
    if (plan.movementTick > scenario.rules.maxTicks) issue(`scenario.environmentPlans.${index}.movementTick`, 'Incident exceeds race horizon');
  });
  scenario.environmentPlans.sort((a, b) => a.movementTick - b.movementTick || (a.id < b.id ? -1 : 1));
  unique(scenario.guardPlans.map(plan => `${plan.movementTick}:${plan.ruId}`), 'scenario.guardPlans');
  for (const [index, plan] of [...scenario.combatPlans, ...scenario.guardPlans].entries()) {
    reference(plan.ruId, ruIds, `scenario.combatPlans.${index}.ruId`);
    if (plan.movementTick > scenario.rules.maxTicks) issue(`scenario.combatPlans.${index}.movementTick`, 'Combat plan exceeds movement horizon');

  }
  scenario.combatPlans.forEach((plan, index) => { reference(plan.targetRuId, ruIds, `scenario.combatPlans.${index}.targetRuId`); reference(plan.weaponId, catalogIds.weapons, `scenario.combatPlans.${index}.weaponId`); });
  unique(scenario.combatPlans.map(plan => `${plan.movementTick}:${plan.ruId}:${content.weapons.find(weapon => weapon.id === plan.weaponId)?.channel}`), 'scenario.combatPlans');
  scenario.combatPlans.sort((a, b) => a.movementTick - b.movementTick || (a.ruId < b.ruId ? -1 : a.ruId > b.ruId ? 1 : a.weaponId < b.weaponId ? -1 : 1));
  scenario.guardPlans.sort((a, b) => a.movementTick - b.movementTick || (a.ruId < b.ruId ? -1 : 1));
  const track = content.tracks.find(candidate => candidate.id === scenario.trackId);
  for (const ruId of ruIds) if (!Object.hasOwn(scenario.startingGrid, ruId)) issue(`scenario.startingGrid.${ruId}`, 'Missing grid position');
  const occupied: string[] = [];
  for (const [ruId, tile] of Object.entries(scenario.startingGrid)) {
    reference(ruId, ruIds, `scenario.startingGrid.${ruId}`);
    if (track && !track.segments.find(segment => segment.id === tile.segmentId)?.lanes.some(lane => lane.index === tile.lane)) issue(`scenario.startingGrid.${ruId}`, 'Invalid starting tile');
    occupied.push(`${tile.segmentId}:${tile.lane}`);
  }
  unique(occupied, 'scenario.startingGrid');
  unique(scenario.gridRows.map(row => row.id), 'scenario.gridRows');
  unique(scenario.gridRows.map(row => row.segmentId), 'scenario.gridRows.segmentId');
  const rowMembers: string[] = [];
  scenario.gridRows.forEach((row, index) => {
    row.ruIds.forEach(ruId => {
      reference(ruId, ruIds, `scenario.gridRows.${index}.ruIds`);
      if (scenario.startingGrid[ruId]?.segmentId !== row.segmentId) issue(`scenario.gridRows.${index}`, 'Every member of an aligned row must start on the same segment');
      rowMembers.push(ruId);
    });
  });
  unique(rowMembers, 'scenario.gridRows.ruIds');
  for (const ruId of ruIds) if (!rowMembers.includes(ruId)) issue('scenario.gridRows', `Missing row membership for ${ruId}`);
  if (issues.length) throw new SetupValidationError(issues);
  // Parse results own all data; canonicalize semantic collections without mutating callers.
  const byId = <T extends { id: string }>(a: T, b: T) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  catalogs.forEach(key => content[key].sort(byId));
  for (const tuning of content.tuningProfiles) tuning.environment.traitModifiers.sort((a, b) => a.traitId < b.traitId ? -1 : 1);
  content.speciesIds.sort(); content.traitIds.sort();
  content.beasts.forEach(beast => { beast.traits.sort(); beast.naturalAttackIds.sort(); });
  content.chariots.forEach(chariot => chariot.equipmentIds.sort());
  content.weapons.forEach(weapon => { weapon.allowedArcs.sort(); weapon.eligibleTargets.sort(); });
  content.tracks.forEach(track => {
    track.segments.sort((a, b) => a.order - b.order);
    track.segments.forEach(segment => { segment.lanes.sort((a, b) => a.index - b.index); segment.lanes.forEach(lane => lane.lateralNeighbors.sort((a, b) => a - b)); });
  });
  scenario.entries.sort(byId);
  scenario.entries.forEach(entry => { entry.beastIds.sort(); entry.weaponIds.sort(); });
  scenario.gridRows.sort(byId); scenario.gridRows.forEach(row => row.ruIds.sort());
  scenario.startingGrid = Object.fromEntries(Object.entries(scenario.startingGrid).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  return { scenario, content };
}
