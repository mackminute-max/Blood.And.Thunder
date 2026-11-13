import { mountRacePresentation } from '../presentation/race/panel.ts';
import { mountSetupInspector } from '../presentation/developer/setup.ts';
import { parseSetupJson } from '../configuration/load.ts';
import { createRaceEngine } from '../simulation/core/race-engine.ts';
import { createMovementEngine } from '../simulation/core/movement-engine.ts';
import scenarioJson from '../content/oval-six-v1.scenario.json?raw';
import contentJson from '../content/reference.content.json?raw';
import './style.css';
const presentation = mountRacePresentation();
mountSetupInspector(scenarioJson, contentJson, scenarioJson, (scenarioSource, contentSource, mode) => {
  if (mode === 'race') {
    const engine = createRaceEngine(parseSetupJson(scenarioSource, 'scenario'), parseSetupJson(contentSource, 'content'));
    return { initialConfiguration: engine.initialConfiguration, controlledRuId: engine.initialConfiguration.scenario.entries.find(entry => entry.isPlayer)?.id ?? null, submit: (input, context) => engine.submit(input, context), tickDurationSeconds: engine.initialConfiguration.content.tuningProfiles.find(profile => profile.id === engine.initialConfiguration.scenario.tuningProfileId)!.tickDurationSeconds, initial: { state: engine.snapshot(), events: engine.initializationEvents, diagnostics: [], stateHash: engine.latest().stateHash }, step: () => engine.step(), exportBundle: () => engine.exportBundle() };
  }
  const engine = createMovementEngine(parseSetupJson(scenarioSource, 'scenario'), parseSetupJson(contentSource, 'content'));
  return { initialConfiguration: engine.initialConfiguration, controlledRuId: engine.initialConfiguration.scenario.entries.find(entry => entry.isPlayer)?.id ?? null, submit: (input, context) => engine.submit(input, context), tickDurationSeconds: engine.initialConfiguration.content.tuningProfiles.find(profile => profile.id === engine.initialConfiguration.scenario.tuningProfileId)!.tickDurationSeconds, initial: { state: engine.snapshot(), events: engine.initializationEvents, diagnostics: [], stateHash: engine.latest().stateHash }, step: () => engine.step(), exportBundle: () => engine.exportBundle() };
}, presentation);
