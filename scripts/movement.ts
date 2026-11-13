import { readFileSync } from 'node:fs';
import { parseSetupJson } from '../src/configuration/load.ts';
import { createMovementEngine } from '../src/simulation/core/movement-engine.ts';
try {
  const ticks = Number(process.argv[2] ?? 1);
  const scenarioFile = process.argv[3] ?? new URL('../src/content/oval-six-v1.scenario.json', import.meta.url);
  const contentFile = process.argv[4] ?? new URL('../src/content/reference.content.json', import.meta.url);
  const engine = createMovementEngine(parseSetupJson(readFileSync(scenarioFile, 'utf8'), 'scenario'), parseSetupJson(readFileSync(contentFile, 'utf8'), 'content'));
  if (!Number.isSafeInteger(ticks) || ticks < 0 || ticks > engine.initialConfiguration.scenario.rules.maxTicks) throw new Error('Ticks must be an integer between zero and scenario maxTicks');
  for (let tick = 0; tick < ticks; tick++) if (engine.step().state.phase === 'error') break;
  console.log(engine.exportBundle());
  if (engine.snapshot().phase === 'error') process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Movement failed');
  process.exitCode = 1;
}
