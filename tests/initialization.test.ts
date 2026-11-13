import { describe, expect, it } from 'vitest';
import { initializeRace } from '../src/simulation/core/initialize.ts';
import { SetupValidationError, validateSetup } from '../src/configuration/validate.ts';
import { fixture } from './setup-fixture.ts';

describe('A1 validated initialization', () => {
  it('initializes all reference components on aligned rows without starting a race', () => {
    const { scenario, content } = fixture();
    const engine = initializeRace(scenario, content);
    const state = engine.snapshot();
    expect(state.phase).toBe('grid'); expect(state.tick).toBe(0);
    expect(Object.keys(state.ruStates)).toHaveLength(6);
    expect(new Set(Object.values(state.ruStates).map(ru => `${ru.tile.segmentId}:${ru.tile.lane}`)).size).toBe(6);
    for (const row of scenario.gridRows) for (const ruId of row.ruIds) {
      const ru = state.ruStates[ruId];
      expect(ru?.tile.segmentId).toBe(row.segmentId);
      expect(ru?.progressInSegment).toBe(0); expect(ru?.completedLaps).toBe(0);
      expect(ru?.speedMps).toBe(0); expect(ru?.teamFatigue).toBe(0);
      expect(ru?.beasts).toHaveLength(2); expect(ru?.signOpportunitiesRemaining).toBe(3);
      expect(ru?.activeSignId).toBeNull(); expect(ru?.status).toBe('active');
    }
    expect(state.finishRecords).toEqual([]);
    expect(engine.events.map(event => event.type)).toEqual(['race_initialized']);
    expect(engine.diagnostics[0]?.subsystem).toBe('initialization');
    expect(initializeRace(scenario, content).snapshot()).toEqual(state);
  });
  it('owns and recursively freezes configuration, components, RNG words and outputs', () => {
    const { scenario, content } = fixture();
    const engine = initializeRace(scenario, content);
    const before = JSON.stringify(engine);
    const state = engine.snapshot();
    scenario.seed = 'changed'; content.beasts[0]!.currentHealth = 0;
    expect(state.seed).toBe('BT-OVAL-SIX-001');
    expect(engine.initialConfiguration.content.beasts.find(beast => beast.id === content.beasts[0]!.id)?.currentHealth).toBe(100);
    expect(Reflect.set(state.rngStates.ai, '0', 0)).toBe(false);
    expect(Reflect.set(state.ruStates['ru-player']!.beasts[0]!, 'health', 0)).toBe(false);
    expect(Reflect.set(engine.initialConfiguration.scenario.entries, '0', null)).toBe(false);
    expect(Reflect.set(engine.events[0]!, 'type', 'race_started')).toBe(false);
    expect(JSON.stringify(engine)).toBe(before);
  });
  it('normalizes semantically unordered content and RU input order', () => {
    const a = fixture(); const b = fixture();
    b.scenario.entries.reverse(); b.scenario.gridRows.reverse();
    b.scenario.startingGrid = Object.fromEntries(Object.entries(b.scenario.startingGrid).reverse());
    b.scenario.entries.forEach(entry => { entry.beastIds.reverse(); entry.weaponIds.reverse(); });
    b.content.beasts.reverse(); b.content.drivers.reverse(); b.content.chariots.reverse(); b.content.weapons.reverse();
    b.content.tracks[0]!.segments.reverse();
    b.content.tracks[0]!.segments.forEach(segment => { segment.lanes.reverse(); segment.lanes.forEach(lane => lane.lateralNeighbors.reverse()); });
    const first = initializeRace(a.scenario, a.content); const second = initializeRace(b.scenario, b.content);
    expect(second.initialConfiguration).toEqual(first.initialConfiguration);
    expect(JSON.stringify(second.snapshot())).toBe(JSON.stringify(first.snapshot()));
    expect(second.events).toEqual(first.events);
  });
  it.each([0, 40, 40.5, 70, 70.5, 100])('initializes continuous health bands at %s percent', health => {
    const { scenario, content } = fixture();
    content.drivers.find(driver => driver.id === 'driver-player')!.currentHealth = health;
    const engine = initializeRace(scenario, content);
    const driver = engine.snapshot().ruStates['ru-player']!.driver;
    expect(driver.band).toBe(health === 0 ? 'disabled' : health <= 40 ? 'critical' : health <= 70 ? 'damaged' : 'functional');
    expect(engine.snapshot().ruStates['ru-player']!.status).toBe(health === 0 ? 'disabled' : 'active');
  });
  it('disables a team only when all its beasts are disabled', () => {
    const { scenario, content } = fixture();
    const beasts = content.beasts.filter(beast => beast.id.startsWith('beast-player-'));
    beasts[0]!.currentHealth = 0;
    expect(initializeRace(scenario, content).snapshot().ruStates['ru-player']!.status).toBe('active');
    beasts[1]!.currentHealth = 0;
    const engine = initializeRace(scenario, content);
    expect(engine.snapshot().ruStates['ru-player']!.status).toBe('disabled');
    expect(engine.diagnostics.some(record => record.ruId === 'ru-player')).toBe(true);
  });
  it('supports variable lane counts with explicit legal connectivity', () => {
    const { scenario, content } = fixture();
    const track = content.tracks[0]!;
    track.segments[1]!.lanes.pop();
    track.segments[1]!.lanes[2]!.lateralNeighbors = [1];
    track.segments[0]!.lanes[3]!.next.lane = 2;
    expect(() => initializeRace(scenario, content)).not.toThrow();
  });
  it('permits playerless headless initialization, preserving rules', () => {
    const { scenario, content } = fixture();
    scenario.mode = 'headless'; scenario.entries.forEach(entry => { entry.isPlayer = false; });
    expect(initializeRace(scenario, content).initialConfiguration.scenario.rules).toEqual(scenario.rules);
  });
});

type Setup = ReturnType<typeof fixture>;
const failures: [string, (setup: Setup) => void, string][] = [
  ['missing driver', s => { s.scenario.entries[0]!.driverId = 'missing'; }, 'driverId'],
  ['duplicate component assignment', s => { s.scenario.entries[1]!.beastIds = s.scenario.entries[0]!.beastIds; }, 'entries.beasts'],
  ['duplicate definition', s => { s.content.beasts.push(s.content.beasts[0]!); }, 'content.beasts'],
  ['duplicate RU ID', s => { s.scenario.entries[1]!.id = s.scenario.entries[0]!.id; }, 'scenario.entries'],
  ['duplicate starting tile', s => { s.scenario.startingGrid['ru-iron'] = s.scenario.startingGrid['ru-player']!; }, 'startingGrid'],
  ['missing starting tile', s => { delete s.scenario.startingGrid['ru-player']; }, 'startingGrid.ru-player'],
  ['unknown grid entrant', s => { s.scenario.startingGrid['ru-unknown'] = { segmentId: 'seg-00', lane: 0 }; }, 'startingGrid.ru-unknown'],
  ['invalid grid lane', s => { s.scenario.startingGrid['ru-player']!.lane = 9; }, 'startingGrid.ru-player'],
  ['staggered row member', s => { s.scenario.startingGrid['ru-player']!.segmentId = 'seg-01'; }, 'gridRows'],
  ['missing row member', s => { s.scenario.gridRows[0]!.ruIds.pop(); }, 'gridRows'],
  ['duplicate row member', s => { s.scenario.gridRows[0]!.ruIds.push('ru-player'); }, 'gridRows'],
  ['unknown weather', s => { s.scenario.weatherId = 'missing'; }, 'weatherId'],
  ['unknown lethality', s => { s.scenario.lethalityProfileId = 'missing'; }, 'lethalityProfileId'],
  ['unknown tuning', s => { s.scenario.tuningProfileId = 'missing'; }, 'tuningProfileId'],
  ['unknown species', s => { s.content.beasts[0]!.speciesId = 'missing'; }, 'speciesId'],
  ['unknown natural attack', s => { s.content.beasts[0]!.naturalAttackIds = ['missing']; }, 'naturalAttackIds'],
  ['unknown equipment', s => { s.content.chariots[0]!.equipmentIds = ['missing']; }, 'equipmentIds'],
  ['nonfinite number', s => { s.content.beasts[0]!.speed = Infinity; }, 'speed'],
  ['stat outside range', s => { s.content.beasts[0]!.speed = 101; }, 'speed'],
  ['health outside range', s => { s.content.beasts[0]!.currentHealth = 101; }, 'currentHealth'],
  ['bad threshold ordering', s => { s.content.tuningProfiles[0]!.condition.criticalMaxPercent = 80; }, 'condition'],
  ['no player', s => { s.scenario.entries[0]!.isPlayer = false; }, 'entries'],
  ['two players', s => { s.scenario.entries[1]!.isPlayer = true; }, 'entries'],
  ['bad connection', s => { s.content.tracks[0]!.segments[0]!.lanes[0]!.next.segmentId = 'missing'; }, 'next'],
  ['invalid adjacent lane', s => { s.content.tracks[0]!.segments[0]!.lanes[0]!.lateralNeighbors = [2]; }, 'lateralNeighbors'],
  ['nonreciprocal lane link', s => { s.content.tracks[0]!.segments[0]!.lanes[0]!.lateralNeighbors = []; }, 'lateralNeighbors'],
  ['zero segment length', s => { s.content.tracks[0]!.segments[0]!.meters = 0; }, 'meters'],
  ['duplicate segment order', s => { s.content.tracks[0]!.segments[1]!.order = 0; }, 'order'],
  ['missing finish boundary', s => { s.content.tracks[0]!.segments[0]!.startFinishBoundary = false; }, 'boundary'],
  ['zero cooldown', s => { s.content.weapons[0]!.cooldownTicks = 0; }, 'cooldownTicks'],
  ['illegal contact timing', s => { s.content.weapons[0]!.timing = 'contact'; }, 'timing'],
];
it.each(failures)('rejects %s with a useful path', (_name, mutate, path) => {
  const setup = fixture(); mutate(setup);
  expect(() => initializeRace(setup.scenario, setup.content)).toThrow(SetupValidationError);
  try { validateSetup(setup.scenario, setup.content); }
  catch (error) {
    expect(error).toBeInstanceOf(SetupValidationError);
    const issues = (error as SetupValidationError).issues;
    expect(issues.some(issue => `${issue.path} ${issue.message}`.includes(path))).toBe(true);
  }
});
it('collects independent reference errors instead of stopping at the first', () => {
  const setup = fixture(); setup.scenario.trackId = 'missing'; setup.scenario.weatherId = 'missing';
  try { validateSetup(setup.scenario, setup.content); throw new Error('Expected rejection'); }
  catch (error) { expect((error as SetupValidationError).issues.map(issue => issue.path)).toEqual(expect.arrayContaining(['scenario.trackId', 'scenario.weatherId'])); }
});
it.each([
  { schemaVersion: 'unknown' }, { simulationVersion: 'unknown' }, { seed: ' ' },
  { scriptedCommands: [{ type: 'raiseSign', ruId: 'ru-player', signId: 'push', effectiveTick: 0 }] },
  { unexpected: true },
])('rejects unsupported or malformed scenario fields %j', patch => {
  const { scenario, content } = fixture();
  expect(() => initializeRace({ ...scenario, ...patch }, content)).toThrow(SetupValidationError);
});
