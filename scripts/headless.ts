import { readFileSync } from 'node:fs';
import { parseSetupJson } from '../src/configuration/load.ts';
import { initializeRace } from '../src/simulation/core/initialize.ts';
const scenarioFile = process.argv[2] ?? new URL('../src/content/oval-six-v1.scenario.json', import.meta.url);
const contentFile = process.argv[3] ?? new URL('../src/content/reference.content.json', import.meta.url);
try {
  const scenario = parseSetupJson(readFileSync(scenarioFile, 'utf8'), 'scenario');
  const content = parseSetupJson(readFileSync(contentFile, 'utf8'), 'content');
  const engine = initializeRace(scenario, content);
  console.log(JSON.stringify({ state: engine.snapshot(), events: engine.events, diagnostics: engine.diagnostics }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Initialization failed');
  process.exitCode = 1;
}
