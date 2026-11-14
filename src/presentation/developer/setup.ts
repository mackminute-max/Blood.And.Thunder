import { bulkFields, previewBulkEdit } from '../../configuration/bulk-edit.ts';
import { mountComparison } from './comparison.ts';
import type { DeepReadonly, InitialConfiguration } from '../../contracts/initialization.ts';
import type { ViewFrame } from '../race/model.ts';
import type { mountRacePresentation } from '../race/panel.ts';
import type { CommandReceipt } from '../../contracts/ai.ts';
import { createRecording, filterLogs, framePhase, frameTick } from '../../diagnostics/recording.ts';
import type { InspectionOutput, LogFilter } from '../../diagnostics/recording.ts';
import { exportConfiguration, importConfiguration, saveConfiguration, loadConfiguration, listConfigurations, validateSavedConfiguration } from '../../persistence/configuration.ts';
import { parseSetupJson } from '../../configuration/load.ts';
import { validateSetup } from '../../configuration/validate.ts';
import { mountNumericEditor } from './numeric-editor.ts';
interface InspectionSession { initialConfiguration: DeepReadonly<InitialConfiguration>; controlledRuId: string | null; submit(input: unknown, context: { paused: boolean }): CommandReceipt; tickDurationSeconds: number; initial: ViewFrame; step(): ViewFrame; exportBundle(): string }
type Factory = (scenario: string, content: string, mode: 'movement' | 'race') => InspectionSession;
export function mountSetupInspector(scenarioJson: string, contentJson: string, raceScenarioJson: string, initialize: Factory, presentation: ReturnType<typeof mountRacePresentation>): void {
  const get = <T extends HTMLElement>(id: string): T => {
    const element = document.getElementById(id); if (!element) throw new Error(`Missing developer element ${id}`); return element as T;
  };
  const scenario = get<HTMLTextAreaElement>('scenario-json'); const content = get<HTMLTextAreaElement>('content-json');
  const mode = get<HTMLSelectElement>('engine-mode'); const step = get<HTMLButtonElement>('step-tick');
  const feedback = get('setup-feedback'); const output = get('initial-state'); const name = get<HTMLInputElement>('configuration-name');
  const savedNames = get<HTMLSelectElement>('saved-configurations'); const ticks = get<HTMLSelectElement>('selected-tick');
  const logs = get('log-rows'); const detail = get('log-detail'); const play = get<HTMLButtonElement>('play-pause');
  const speed = get<HTMLSelectElement>('playback-speed'); const category = get<HTMLSelectElement>('asset-category');
  const asset = get<HTMLSelectElement>('asset-id'); const preview = get('derived-preview'); const numeric = get('numeric-fields');
  const historyLimit = get<HTMLInputElement>('history-limit'); const recordLimit = get<HTMLInputElement>('record-limit');
  const defaultContent = parseSetupJson(contentJson, 'content') as Record<string, { id: string }[]>;
  const defaultScenario = parseSetupJson(scenarioJson, 'scenario') as Record<string, unknown>;
  scenario.value = scenarioJson; content.value = contentJson;
  let session: InspectionSession | undefined; let recording = createRecording();
  let timer: ReturnType<typeof setTimeout> | undefined; let playing = false; let selectedTick: number | null = null;
  let live: InspectionOutput | undefined; let commandSequence = 0;
  const engineMode = () => mode.value === 'race' ? 'race' as const : 'movement' as const;
  const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
  const stop = () => { presentation.pause(); playing = false; if (timer !== undefined) clearTimeout(timer); timer = undefined; play.textContent = 'Play'; get<HTMLButtonElement>('queue-override').disabled = !live || ['complete', 'error', 'halted'].includes(framePhase(live)); get<HTMLButtonElement>('clear-override').disabled = !live || ['complete', 'error', 'halted'].includes(framePhase(live)); step.disabled = !live || ['complete', 'error', 'halted'].includes(framePhase(live)); };
  const download = (source: string, filename: string) => {
    if (new Blob([source]).size > 20 * 1024 * 1024) throw new Error('Export exceeds 20 MiB. Use Export latest / crash snapshot for current state; reduce history/record limits and rerun for a smaller trace. No data was uploaded.');
    const url = URL.createObjectURL(new Blob([source], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const attempt = async (action: () => void | Promise<void>) => { try { await action(); } catch (error) { feedback.textContent = errorMessage(error); } };
  const refreshSaved = async () => {
    const names = await listConfigurations(); savedNames.replaceChildren();
    for (const value of names) savedNames.add(new Option(value, value));
  };
  const savedDraft = () => validateSavedConfiguration({ kind: 'blood-thunder-configuration-a4-1', name: name.value, mode: engineMode(), scenario: parseSetupJson(scenario.value, 'scenario'), content: parseSetupJson(content.value, 'content') });
  const showPreview = () => {
    try {
      const result = initialize(scenario.value, content.value, engineMode()).initial;
      const state = result.state as { ruStates: Record<string, { derived: unknown }> };
      preview.textContent = JSON.stringify(Object.fromEntries(Object.entries(state.ruStates).map(([id, ru]) => [id, ru.derived])), null, 2);
    } catch (error) { preview.textContent = errorMessage(error); }
  };
  const refreshNumeric = () => {
    try {
      const setup = validateSetup(parseSetupJson(scenario.value, 'scenario'), parseSetupJson(content.value, 'content'));
      // Use the original draft order when writing back (not validation's normalized order).
      const draft = parseSetupJson(content.value, 'content') as Record<string, unknown>;
      const items = draft[category.value] as { id: string }[];
      const chosen = asset.value; asset.replaceChildren();
      for (const item of items) asset.add(new Option(item.id, item.id));
      if (items.some(item => item.id === chosen)) asset.value = chosen;
      const index = items.findIndex(item => item.id === asset.value); const item = items[index];
      if (item) mountNumericEditor(numeric, item, changed => {
        items[index] = changed as { id: string }; content.value = JSON.stringify(draft, null, 2); showPreview();
        get('draft-status').textContent = 'Draft changed. Reinitialize to apply; active run is unchanged.';
      }, [category.value, String(index)], defaultContent[category.value]?.find(reference => reference.id === item.id));
      mountNumericEditor(get('rule-fields'), setup.scenario.rules, changed => {
        const scenarioDraft = parseSetupJson(scenario.value, 'scenario') as Record<string, unknown>; scenarioDraft.rules = changed;
        scenario.value = JSON.stringify(scenarioDraft, null, 2); showPreview(); get('draft-status').textContent = 'Draft changed. Reinitialize to apply; active run is unchanged.';
      }, ['$scenario', 'rules'], defaultScenario.rules);
      const bulkField = get<HTMLSelectElement>('bulk-field'); const selectedBulk = bulkField.value; bulkField.replaceChildren();
      for (const field of bulkFields(setup)) bulkField.add(new Option(field, field));
      if (bulkFields(setup).includes(selectedBulk)) bulkField.value = selectedBulk;
      const tuningIndex = setup.content.tuningProfiles.findIndex(p=>p.id===setup.scenario.tuningProfileId);
      const influence = setup.content.tuningProfiles[tuningIndex]!.ai.signInfluence;
      const describeInfluence = (value: typeof influence) => { get('sign-effective').textContent = JSON.stringify(Object.fromEntries(Object.entries(value.perSign).map(([key,strength])=>[key,{ global: value.globalStrength, perSign: strength, effectiveMultiplier: value.globalStrength*strength }])),null,2); };
      mountNumericEditor(get('sign-tuning-fields'), influence, changed => {
        try {
        const next = validateSetup(parseSetupJson(scenario.value,'scenario'),parseSetupJson(content.value,'content'));
        next.content.tuningProfiles[tuningIndex]!.ai.signInfluence = changed as typeof influence;
        validateSetup(next.scenario,next.content); content.value=JSON.stringify(next.content,null,2); describeInfluence(changed as typeof influence); showPreview();
        get('draft-status').textContent='Sign tuning draft changed. Reinitialize to apply.';
        } catch (error) { feedback.textContent=errorMessage(error); }
      }, ['tuningProfiles',String(tuningIndex),'ai','signInfluence'], (defaultContent.tuningProfiles?.find(p=>p.id===setup.scenario.tuningProfileId) as unknown as {ai?:{signInfluence?:unknown}})?.ai?.signInfluence ?? influence);
      describeInfluence(influence);
      const planRU = get<HTMLSelectElement>('maneuver-ru'); const priorRU = planRU.value; planRU.replaceChildren();
      for (const entry of setup.scenario.entries) planRU.add(new Option(entry.id, entry.id));
      if (setup.scenario.entries.some(entry => entry.id === priorRU)) planRU.value = priorRU;
      get<HTMLSelectElement>('competition-style').value = setup.scenario.rules.competitionStyle;
      const controller = get<HTMLSelectElement>('controller-mode'); controller.value = setup.scenario.controller;
      const overrideRU = get<HTMLSelectElement>('override-ru'); const priorOverride = overrideRU.value; overrideRU.replaceChildren();
      for (const entry of setup.scenario.entries) overrideRU.add(new Option(entry.id, entry.id));
      if (setup.scenario.entries.some(entry => entry.id === priorOverride)) overrideRU.value = priorOverride;
      get('maneuver-plans').textContent = JSON.stringify(setup.scenario.maneuvers, null, 2);
      const weather = get<HTMLSelectElement>('environment-weather'); weather.replaceChildren(); for (const definition of setup.content.weather) weather.add(new Option(definition.name, definition.id)); weather.value = setup.scenario.weatherId;
      get<HTMLSelectElement>('environment-intensity').value = setup.scenario.eventIntensity;
      get<HTMLTextAreaElement>('environment-plans-json').value = JSON.stringify(setup.scenario.environmentPlans, null, 2);
      get<HTMLTextAreaElement>('combat-plans-json').value = JSON.stringify(setup.scenario.combatPlans, null, 2);
      get<HTMLTextAreaElement>('guard-plans-json').value = JSON.stringify(setup.scenario.guardPlans, null, 2);
      showPreview();
    } catch (error) { numeric.replaceChildren(); preview.textContent = errorMessage(error); }
  };
  const filter = (): LogFilter => {
    const min = get<HTMLInputElement>('filter-min').value; const max = get<HTMLInputElement>('filter-max').value;
    return { ...(min ? { minTick: Number(min) } : {}), ...(max ? { maxTick: Number(max) } : {}), ruId: get<HTMLInputElement>('filter-ru').value, subsystem: get<HTMLInputElement>('filter-subsystem').value, level: get<HTMLSelectElement>('filter-level').value, type: get<HTMLInputElement>('filter-type').value, search: get<HTMLInputElement>('filter-search').value };
  };
  const renderLogs = () => {
    const matches = filterLogs(recording.rows(), filter()); logs.replaceChildren();
    get('log-count').textContent = `${matches.length} matching records. Showing up to 300; export retains all buffered records.`;
    for (const row of matches.slice(-300)) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'log-row';
      button.textContent = `${row.tick}:${row.substep} ${row.level} ${row.ruId || row.actorIds.join(',')} ${row.subsystem} ${row.message}`;
      button.addEventListener('click', () => { detail.textContent = JSON.stringify(row.detail, null, 2); }); logs.append(button);
    }
  };
  const display = (result: InspectionOutput) => {
    output.textContent = JSON.stringify(result, null, 2);
    get('viewing-tick').textContent = `Viewing tick ${frameTick(result)}; live tick ${live ? frameTick(live) : 0}. Historical inspection never rewinds the simulation.`;
    const state = result.state as { ruStates: Record<string, unknown> };
    const ruId = get<HTMLInputElement>('inspect-ru').value;
    get('movement-inspection').textContent = JSON.stringify({ events: result.events.filter(event => typeof event === 'object' && event !== null && 'type' in event && /^(movement_|lane_change_|handling_|collision_)/.test(String(event.type))), diagnostics: result.diagnostics.filter(record => typeof record === 'object' && record !== null && 'subsystem' in record && record.subsystem === 'movement') }, null, 2);
    get('ai-inspection').textContent = JSON.stringify(Object.fromEntries(Object.entries(state.ruStates).map(([id, ru]) => [id, typeof ru === 'object' && ru !== null && 'aiDecision' in ru ? ru.aiDecision : null])), null, 2);
    get('environment-inspection').textContent = JSON.stringify({ environment: (result.state as Record<string, unknown>).environment, hazards: (result.state as Record<string, unknown>).hazards, units: Object.fromEntries(Object.entries(state.ruStates).map(([id, value]) => { const ru = value as Record<string, unknown>; const fatigue = Number(ru.teamFatigue); return [id, { fatigue, fatigueBand: fatigue < 25 ? 'Fresh' : fatigue < 50 ? 'Working' : fatigue < 75 ? 'Tired' : 'Exhausted', stats: ru.environmentStats, disabledAtMovementTick: ru.disabledAtMovementTick, wreckRemoved: ru.wreckRemoved, memory: (ru.aiMemory as Record<string, unknown>).hazards }]; })), events: result.events.filter(event => typeof event === 'object' && event !== null && 'type' in event && /^(hazard_|fatigue_|wreck_|collision_)/.test(String(event.type))) }, null, 2);
    get('combat-inspection').textContent = JSON.stringify({ units: Object.fromEntries(Object.entries(state.ruStates).map(([id, value]) => { const ru = value as Record<string, unknown>; return [id, { decision: ru.combatDecision, channels: ru.cooldowns, actions: ru.actionCooldowns, stats: ru.combatStats, components: [ru.driver, ru.chariot, ru.beasts] }]; })), events: result.events.filter(event => typeof event === 'object' && event !== null && 'type' in event && /^(attack_|ram_|combat_|defense_|component_|ru_disabled)/.test(String(event.type))), diagnostics: result.diagnostics.filter(record => typeof record === 'object' && record !== null && 'subsystem' in record && record.subsystem === 'combat') }, null, 2);
    get('ru-state').textContent = JSON.stringify(ruId ? state.ruStates[ruId] ?? { error: 'Unknown RU ID' } : state.ruStates, null, 2);
  };
  const renderHistory = () => {
    const frames = recording.frames(); ticks.replaceChildren();
    for (const frame of frames) ticks.add(new Option(`Tick ${frameTick(frame)}`, String(frame.captureId)));
    const selected = frames.find(frame => frame.captureId === selectedTick) ?? frames.at(-1);
    if (selected) { ticks.value = String(selected.captureId); display(selected); }
    if (live) {
      const state = live.state as { ruStates: Record<string, { status: string; pendingSign: {signId:string;queuedAtTick:number} | null; activeSignId: string | null; signOpportunitiesRemaining: number; aiDecision: { chosen: { mode: string } } | null }> };
      const controlled = session?.controlledRuId ? state.ruStates[session.controlledRuId] : undefined;
      get('sign-status').textContent = controlled ? `Active sign: ${controlled.activeSignId ?? 'none'} · Pending: ${controlled.pendingSign?.signId ?? 'none'}${controlled.pendingSign ? ' (activates at next line crossing; queued tick '+controlled.pendingSign.queuedAtTick+')' : ''} · Opportunities: ${controlled.signOpportunitiesRemaining} · Driver behavior: ${controlled.aiDecision?.chosen.mode ?? 'fixture / awaiting decision'}` : 'No controlled player RU.';
      for (const id of ['raise-sign', 'lower-sign', 'cancel-pending-sign']) get<HTMLButtonElement>(id).disabled = !controlled || controlled.status !== 'active' || id === 'raise-sign' && (controlled.signOpportunitiesRemaining === 0 || controlled.pendingSign !== null) || ['complete', 'error', 'halted'].includes(framePhase(live));
    }
    get('history-summary').textContent = JSON.stringify(recording.summary()); renderLogs();
  };
  const run = () => {
    stop(); session = undefined; live = undefined; for (const id of ['raise-sign', 'lower-sign', 'cancel-pending-sign', 'queue-override', 'clear-override']) get<HTMLButtonElement>(id).disabled = true; selectedTick = null; commandSequence = 0; get('command-feedback').textContent = ''; step.disabled = true; play.disabled = true;
    get<HTMLButtonElement>('export-diagnostics').disabled = true; get<HTMLButtonElement>('export-latest').disabled = true;
    try {
      recording = createRecording(Number(historyLimit.value), Number(recordLimit.value));
      session = initialize(scenario.value, content.value, engineMode()); live = session.initial; recording.append(live); presentation.reset(session.initialConfiguration, session.initial);
      step.disabled = false; play.disabled = false; get<HTMLButtonElement>('queue-override').disabled = false; get<HTMLButtonElement>('clear-override').disabled = false; get<HTMLButtonElement>('export-diagnostics').disabled = false; get<HTMLButtonElement>('export-latest').disabled = false;
      feedback.textContent = 'Initialized and paused. Configuration edits require reinitialization; selected paused overrides use the command queue.';
      get('draft-status').textContent = 'Draft applied to this run.';
      document.documentElement.dataset.initializationReady = 'true'; renderHistory(); refreshNumeric();
    } catch (error) {
      presentation.clear('Invalid setup. Correct the configuration and initialize.');
      output.textContent = ''; logs.replaceChildren(); ticks.replaceChildren(); detail.textContent = ''; get('ru-state').textContent = '';
      feedback.textContent = errorMessage(error); document.documentElement.dataset.initializationReady = 'false';
    }
  };
  const advance = () => {
    if (!session) return;
    const frame = session.step(); live = frame;
    try { presentation.frame(frame, playing ? session.tickDurationSeconds * 1000 / Number(speed.value) : 0); } catch (error) { get('status').textContent = `Presentation error: ${errorMessage(error)}. Authoritative state remains available in developer tools.`; }
    const commandEvents = live.events.filter((event): event is { type: string; details: Record<string, unknown> } => typeof event === 'object' && event !== null && 'type' in event && 'details' in event && /^(command_|sign_|developer_override)/.test(String(event.type)));
    const rejected = commandEvents.find(event => event.type === 'command_rejected');
    if (rejected) get('command-feedback').textContent = `Rejected at tick ${frameTick(live)}: ${String(rejected.details.reason)}`;
    else if (commandEvents.length) get('command-feedback').textContent = `Commands applied at tick ${frameTick(live)}. Inspect active sign and actual driver behavior separately.`;
    recording.append(live); selectedTick = null; renderHistory();
    if (['complete', 'error', 'halted'].includes(framePhase(live))) { stop(); play.disabled = true; feedback.textContent = `Simulation stopped: ${framePhase(live)}. Inspect results and diagnostics.`; }
  };
  const schedule = () => {
    if (!playing) return;
    timer = setTimeout(() => {
      try { advance(); } catch (error) { stop(); feedback.textContent = errorMessage(error); }
      if (playing) schedule();
    }, (session?.tickDurationSeconds ?? .2) * 1000 / Number(speed.value));
  };
  const submit = (type: 'raiseSign' | 'lowerSign' | 'cancelPendingSign' | 'developerOverride', clear = false) => {
    if (!session || !live) return;
    const commandId = `ui-${++commandSequence}`; const effectiveTick = frameTick(live) + 1;
    const command = type === 'developerOverride' ? { type, commandId, effectiveTick, source: 'developer', ruId: get<HTMLSelectElement>('override-ru').value, field: get<HTMLSelectElement>('override-field').value, value: clear ? null : get<HTMLInputElement>('override-value').valueAsNumber } : { type, commandId, effectiveTick, source: 'player', ruId: session.controlledRuId, ...(type === 'raiseSign' ? { signId: get<HTMLSelectElement>('sign-choice').value } : {}) };
    const receipt = session.submit(command, { paused: !playing });
    get('command-feedback').textContent = receipt.accepted ? `Queued ${type} for tick ${effectiveTick}; command processes at that boundary; queued signs activate at the starting signal or next line crossing.` : receipt.reason;
  };
  let pendingBulk: ReturnType<typeof previewBulkEdit> | null = null; let bulkBefore: {scenario:string;content:string} | null = null;
  let bulkAfter: {scenario:string;content:string} | null = null;
  get('bulk-preview').addEventListener('click', () => void attempt(() => {
    pendingBulk=null;get<HTMLButtonElement>('bulk-apply').disabled=true;
    const raw=get<HTMLInputElement>('bulk-value').value; let value:unknown=raw;
    try {value=JSON.parse(raw) as unknown;} catch { /* Enum input may be plain text. */ }
    const draft=validateSetup(parseSetupJson(scenario.value,'scenario'),parseSetupJson(content.value,'content'));
    pendingBulk=previewBulkEdit(draft,get<HTMLSelectElement>('bulk-field').value,value);
    bulkBefore={scenario:scenario.value,content:content.value}; get('bulk-changes').textContent=JSON.stringify(pendingBulk.changes,null,2);get<HTMLButtonElement>('bulk-apply').disabled=false;
  }));
  get('bulk-apply').addEventListener('click', () => void attempt(() => {
    if(!pendingBulk||!bulkBefore)throw new Error('Preview the bulk edit first');
    if(scenario.value!==bulkBefore.scenario||content.value!==bulkBefore.content)throw new Error('Draft changed after preview; preview again');
    scenario.value=JSON.stringify(pendingBulk.configuration.scenario,null,2);content.value=JSON.stringify(pendingBulk.configuration.content,null,2);
    bulkAfter={scenario:scenario.value,content:content.value};pendingBulk=null;get<HTMLButtonElement>('bulk-apply').disabled=true;get<HTMLButtonElement>('bulk-undo').disabled=false;
    refreshNumeric();showPreview();get('draft-status').textContent='Unsaved bulk edit applied to draft. Active race is unchanged.';
  }));
  get('bulk-undo').addEventListener('click', () => void attempt(() => {
    if(!bulkBefore||!bulkAfter)throw new Error('No bulk edit to restore');
    if(scenario.value!==bulkAfter.scenario||content.value!==bulkAfter.content)throw new Error('Further edits exist; restore a saved scenario or undo those edits first');
    scenario.value=bulkBefore.scenario;content.value=bulkBefore.content;bulkAfter=null;pendingBulk=null;refreshNumeric();showPreview();get<HTMLButtonElement>('bulk-undo').disabled=true;get<HTMLButtonElement>('bulk-apply').disabled=true;get('draft-status').textContent='Original values restored to draft.';
  }));
  get('raise-sign').addEventListener('click', () => submit('raiseSign'));
  get('lower-sign').addEventListener('click', () => submit('lowerSign'));
  get('cancel-pending-sign').addEventListener('click', () => submit('cancelPendingSign'));
  get('queue-override').addEventListener('click', () => submit('developerOverride'));
  get('clear-override').addEventListener('click', () => submit('developerOverride', true));
  get('competition-style').addEventListener('change', () => void attempt(() => { const draft = savedDraft(); draft.scenario.rules.competitionStyle = get<HTMLSelectElement>('competition-style').value as 'combat' | 'pure'; const validated = validateSetup(draft.scenario, draft.content); scenario.value = JSON.stringify(validated.scenario, null, 2); refreshNumeric(); get('draft-status').textContent = 'Ruleset draft changed. Reinitialize to apply.'; }));
  get('controller-mode').addEventListener('change', () => void attempt(() => { const draft = parseSetupJson(scenario.value, 'scenario') as Record<string, unknown>; draft.controller = get<HTMLSelectElement>('controller-mode').value; scenario.value = JSON.stringify(draft, null, 2); refreshNumeric(); get('draft-status').textContent = 'Controller draft changed. Reinitialize to apply.'; }));
  get('add-maneuver').addEventListener('click', () => void attempt(() => {
    const setup = validateSetup(parseSetupJson(scenario.value, 'scenario'), parseSetupJson(content.value, 'content'));
    const next = { ...setup.scenario, maneuvers: [...setup.scenario.maneuvers, { movementTick: Number(get<HTMLInputElement>('maneuver-tick').value), ruId: get<HTMLSelectElement>('maneuver-ru').value, laneDelta: Number(get<HTMLSelectElement>('maneuver-delta').value), abortIfBlocked: get<HTMLInputElement>('maneuver-abort').checked }] };
    const validated = validateSetup(next, setup.content);
    scenario.value = JSON.stringify(validated.scenario, null, 2); refreshNumeric();
    get('draft-status').textContent = 'Maneuver fixture added to draft. Reinitialize to apply; active run is unchanged.';
  }));
  get('clear-maneuvers').addEventListener('click', () => void attempt(() => {
    const setup = validateSetup(parseSetupJson(scenario.value, 'scenario'), parseSetupJson(content.value, 'content')); setup.scenario.maneuvers = [];
    scenario.value = JSON.stringify(setup.scenario, null, 2); refreshNumeric(); get('draft-status').textContent = 'Maneuver draft cleared. Reinitialize to apply.';
  }));
  get('apply-environment').addEventListener('click', () => {
    try {
      const draft = parseSetupJson(scenario.value, 'scenario') as Record<string, unknown>;
      const validated = validateSetup({ ...draft, weatherId: get<HTMLSelectElement>('environment-weather').value, eventIntensity: get<HTMLSelectElement>('environment-intensity').value, environmentPlans: parseSetupJson(get<HTMLTextAreaElement>('environment-plans-json').value, 'environment plans') }, parseSetupJson(content.value, 'content'));
      scenario.value = JSON.stringify(validated.scenario, null, 2); refreshNumeric(); get('environment-feedback').textContent = 'Validated environment draft. Reinitialize to apply; active run is unchanged.';
    } catch (error) { get('environment-feedback').textContent = errorMessage(error); }
  });
  get('apply-combat-plans').addEventListener('click', () => {
    try {
      const draft = parseSetupJson(scenario.value, 'scenario') as Record<string, unknown>;
      const validated = validateSetup({ ...draft, combatPlans: parseSetupJson(get<HTMLTextAreaElement>('combat-plans-json').value, 'combat plans'), guardPlans: parseSetupJson(get<HTMLTextAreaElement>('guard-plans-json').value, 'guard plans') }, parseSetupJson(content.value, 'content'));
      scenario.value = JSON.stringify(validated.scenario, null, 2); refreshNumeric(); get('combat-plan-feedback').textContent = 'Validated fixture draft. Reinitialize to apply; active run is unchanged.';
    } catch (error) { get('combat-plan-feedback').textContent = errorMessage(error); }
  });
  get('initialize').addEventListener('click', run); mode.addEventListener('change', run);
  get('load-race-sample').addEventListener('click', () => { scenario.value = raceScenarioJson; content.value = contentJson; mode.value = 'race'; run(); });
  get('reset-configuration').addEventListener('click', () => { scenario.value = scenarioJson; content.value = contentJson; run(); });
  step.addEventListener('click', () => { if (!playing) void attempt(advance); });
  play.addEventListener('click', () => { if (playing) stop(); else if (session) { playing = true; play.textContent = 'Pause'; get<HTMLButtonElement>('queue-override').disabled = true; get<HTMLButtonElement>('clear-override').disabled = true; step.disabled = true; schedule(); } });
  speed.addEventListener('change', () => { if (playing) { if (timer !== undefined) clearTimeout(timer); schedule(); } });
  ticks.addEventListener('change', () => { selectedTick = Number(ticks.value); renderHistory(); });
  get('inspect-ru').addEventListener('input', renderHistory);
  category.addEventListener('change', refreshNumeric); asset.addEventListener('change', refreshNumeric);
  get('preview-draft').addEventListener('click', refreshNumeric);
  for (const id of ['scenario-json', 'content-json']) get(id).addEventListener('input', () => { get('draft-status').textContent = 'Draft changed. Reinitialize to apply; active run is unchanged.'; });
  for (const id of ['filter-min', 'filter-max', 'filter-ru', 'filter-subsystem', 'filter-level', 'filter-type', 'filter-search']) get(id).addEventListener('input', renderLogs);
  get('export-diagnostics').addEventListener('click', () => void attempt(() => {
    if (session) download(JSON.stringify({ ...JSON.parse(session.exportBundle()), developerRecording: { formatVersion: 'a4-1', ...recording.summary(), frames: recording.frames(), records: recording.rows() } }, null, 2), 'blood-and-thunder-diagnostic.json');
  }));
  get('export-latest').addEventListener('click', () => void attempt(() => { if (session) download(session.exportBundle(), 'blood-and-thunder-latest.json'); }));
  get('export-configuration').addEventListener('click', () => void attempt(() => download(exportConfiguration(savedDraft()), 'blood-and-thunder.configuration.json')));
  get('save-configuration').addEventListener('click', () => void attempt(async () => { await saveConfiguration(savedDraft()); await refreshSaved(); savedNames.value = name.value.trim(); feedback.textContent = 'Configuration saved locally in IndexedDB.'; }));
  get('load-configuration').addEventListener('click', () => void attempt(async () => {
    const saved = await loadConfiguration(savedNames.value); scenario.value = JSON.stringify(saved.scenario, null, 2); content.value = JSON.stringify(saved.content, null, 2); name.value = saved.name; mode.value = saved.mode; run();
  }));
  get<HTMLInputElement>('import-configuration').addEventListener('change', () => void attempt(async () => {
    const file = get<HTMLInputElement>('import-configuration').files?.[0]; if (!file) return;
    if (file.size > 20 * 1024 * 1024) throw new Error('Configuration import exceeds 20 MiB');
    const saved = importConfiguration(await file.text()); stop(); scenario.value = JSON.stringify(saved.scenario, null, 2); content.value = JSON.stringify(saved.content, null, 2); name.value = saved.name; mode.value = saved.mode; run();
    get<HTMLInputElement>('import-configuration').value = '';
  }));
  for (const tab of document.querySelectorAll<HTMLButtonElement>('[data-panel]')) tab.addEventListener('click', () => {
    for (const panel of document.querySelectorAll<HTMLElement>('[data-developer-panel]')) panel.hidden = panel.dataset.developerPanel !== tab.dataset.panel;
    for (const candidate of document.querySelectorAll<HTMLButtonElement>('[data-panel]')) candidate.setAttribute('aria-selected', String(candidate === tab));
  });
  mountComparison(() => session?.exportBundle(), () => validateSetup(parseSetupJson(scenario.value, 'scenario'), parseSetupJson(content.value, 'content')));
  run(); void attempt(refreshSaved);
}
