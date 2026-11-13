import { readFileSync } from 'node:fs';
import { parseSetupJson } from '../src/configuration/load.ts';
import { createRaceEngine } from '../src/simulation/core/race-engine.ts';
try {
  const scenarioFile = process.argv[2] ?? new URL('../src/content/oval-six-v1.scenario.json', import.meta.url);
  const contentFile = process.argv[3] ?? new URL('../src/content/reference.content.json', import.meta.url);
  const engine = createRaceEngine(parseSetupJson(readFileSync(scenarioFile, 'utf8'), 'scenario'), parseSetupJson(readFileSync(contentFile, 'utf8'), 'content'));
  engine.runUntilComplete();
  console.log(engine.exportBundle());
  if (engine.snapshot().phase === 'error') process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Race failed');
  process.exitCode = 1;
}
