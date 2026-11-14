import { validateSetup } from '../../configuration/validate.ts';
import type { DeepReadonly, ComponentState, InitialConfiguration, InitialRaceState, InitialRUState, InitializationEvent, InitializationDiagnostic } from '../../contracts/initialization.ts';
import { RNG_VERSION, seedStreams } from './rng.ts';

function freezeDeep<T>(value: T): DeepReadonly<T> {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}
/** Initializes only. No race start, movement, AI decisions, or lap accounting. */
export function initializeRace(scenarioInput: unknown, contentInput: unknown) {
  const setup = validateSetup(scenarioInput, contentInput);
  const { scenario, content } = setup;
  const tuning = content.tuningProfiles.find(profile => profile.id === scenario.tuningProfileId);
  if (!tuning) throw new Error('Validated tuning profile missing');
  const component = (definition: { id: string; currentHealth: number; maxHealth: number }, kind: ComponentState['kind']): ComponentState => {
    const percent = definition.currentHealth / definition.maxHealth * 100;
    const band = percent <= 0 ? 'disabled' : percent <= tuning.condition.criticalMaxPercent ? 'critical' : percent <= tuning.condition.damagedMaxPercent ? 'damaged' : 'functional';
    return { kind, dead: false, id: definition.id, health: definition.currentHealth, maxHealth: definition.maxHealth, band, injuries: [], destroyed: false };
  };
  const ruStates: Record<string, InitialRUState> = {};
  for (const entry of scenario.entries) {
    const driver = content.drivers.find(item => item.id === entry.driverId);
    const chariot = content.chariots.find(item => item.id === entry.chariotId);
    const tile = scenario.startingGrid[entry.id];
    if (!driver || !chariot || !tile) throw new Error('Validated references missing');
    const beasts = entry.beastIds.map(id => {
      const beast = content.beasts.find(item => item.id === id);
      if (!beast) throw new Error('Validated beast missing');
      return component(beast, 'beast');
    });
    const disabled = driver.currentHealth === 0 || chariot.currentHealth === 0 || beasts.every(beast => beast.health === 0);
    ruStates[entry.id] = {
      id: entry.id, tile: { ...tile }, progressInSegment: 0, completedLaps: 0,
      speedMps: 0, targetSpeedMps: 0, teamFatigue: 0, blockedTicks: 0,
      status: disabled ? 'disabled' : 'active', ...(disabled ? { statusReason: 'component_disabled' as const } : {}),
      pendingSign: null, signUsage: { queued: 0, activated: 0, replacements: 0, lowered: 0, cancelled: 0 }, activeSignId: null, signOpportunitiesRemaining: scenario.rules.maxSignOpportunities,
      driver: component(driver, 'driver'), chariot: component(chariot, 'chariot'), beasts,
      cooldowns: { driver: 0, beast: 0, mounted: 0, ram: 0, defense: 0 },
    };
  }
  const state: InitialRaceState = {
    schemaVersion: scenario.schemaVersion, simulationVersion: scenario.simulationVersion,
    scenarioId: scenario.id, tick: 0, phase: 'grid', seed: scenario.seed,
    rngVersion: RNG_VERSION, rngStates: seedStreams(scenario.seed), ruStates,
    hazards: [], finishRecords: [], commandCursor: 0, activeWeatherId: scenario.weatherId,
  };
  const initialConfiguration: DeepReadonly<InitialConfiguration> = freezeDeep(setup);
  const frozen = freezeDeep(state);
  const events: InitializationEvent[] = [{ id: '0:0:0', tick: 0, substep: 0, type: 'race_initialized', actorIds: scenario.entries.map(entry => entry.id), scenarioId: scenario.id }];
  const diagnostics: InitializationDiagnostic[] = [{ tick: 0, substep: 0, level: 'info', subsystem: 'initialization', message: `Initialized ${scenario.entries.length} RUs on aligned grid; race has not started` }];
  for (const ru of Object.values(ruStates)) if (ru.status === 'disabled') diagnostics.push({ tick: 0, substep: 0, level: 'info', subsystem: 'initialization', ruId: ru.id, message: 'RU initialized disabled due to component health' });
  return Object.freeze({ initialConfiguration, snapshot: () => frozen, events: freezeDeep(events), diagnostics: freezeDeep(diagnostics) });
}
