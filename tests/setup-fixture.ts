import { readFileSync } from 'node:fs';
import { contentSchema, scenarioSchema } from '../src/configuration/schemas.ts';
export function fixture() {
  const content = contentSchema.parse(JSON.parse(readFileSync(new URL('../src/content/reference.content.json', import.meta.url), 'utf8')));
  // Isolate pre-C2 mechanic regressions; C2 tests explicitly enable fatigue/events/contact.
  for (const tuning of content.tuningProfiles) { tuning.environment.fatigue.basePerSecond = 0; tuning.environment.fatigue.recoveryPerSecond = 0; tuning.environment.collision.enabled = false; }
  return {
    scenario: { ...scenarioSchema.parse(JSON.parse(readFileSync(new URL('../src/content/oval-six-v1.scenario.json', import.meta.url), 'utf8'))), controller: 'fixture' as const, eventIntensity: 'disabled' as const },
    content,
  };
}
