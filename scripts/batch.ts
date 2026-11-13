import { readFileSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { parseSetupJson } from '../src/configuration/load.ts';
import { validateSetup } from '../src/configuration/validate.ts';
import { copyJson } from '../src/shared/immutable.ts';
import { REPORT_VERSION, runMeasuredRace, aggregate, compareBatches, reportCsv } from '../src/diagnostics/batch.ts';
import { stateHash } from '../src/diagnostics/state-hash.ts';
const schema = z.strictObject({ kind: z.literal('blood-thunder-batch-plan-e1'), seeds: z.array(z.string().min(1)).min(1).max(10000), variants: z.array(z.strictObject({ id: z.string().regex(/^[a-zA-Z0-9_-]+$/), scenarioFile: z.string().min(1), contentFile: z.string().min(1), sign: z.enum(['push-hard','defend-position','attack','conserve']).optional() })).min(1).max(16) });
try {
  if (!process.argv[2]) throw new Error('Usage: npm run batch -- plan.json [output-prefix]');
  const plan = schema.parse(parseSetupJson(readFileSync(process.argv[2], 'utf8'), 'batch plan'));
  if (new Set(plan.seeds).size !== plan.seeds.length || new Set(plan.variants.map(v=>v.id)).size !== plan.variants.length) throw new Error('Seeds and variant IDs must be unique');
  const variants: { id: string; configuration: ReturnType<typeof validateSetup>; configurationHash: string; seeds: string[]; aggregate: ReturnType<typeof aggregate>; runs: ReturnType<typeof runMeasuredRace>[] }[] = [];
  for (const variant of plan.variants) {
    const config = validateSetup(parseSetupJson(readFileSync(variant.scenarioFile, 'utf8'), 'scenario'), parseSetupJson(readFileSync(variant.contentFile, 'utf8'), 'content'));
    if (variant.sign) { const player = config.scenario.entries.find(e=>e.isPlayer); if (!player) throw new Error('Sign variant requires a controlled player RU'); config.scenario.scriptedCommands.push({ commandId: 'e-batch-sign', type: 'raiseSign', source: 'player', effectiveTick: config.scenario.rules.countdownTicks+1, ruId: player.id, signId: variant.sign }); }
    const runs = [];
    for (const seed of plan.seeds) { const scenario = copyJson(config.scenario); scenario.seed = seed; const run = runMeasuredRace(scenario,config.content); runs.push(run); if (runs.length % 25 === 0 || runs.length === plan.seeds.length) console.error(`${variant.id}: ${runs.length}/${plan.seeds.length}`); }
    variants.push({ id: variant.id, configuration: config, configurationHash: stateHash(config), seeds: plan.seeds, aggregate: aggregate(runs), runs });
  }
  const report = { kind: REPORT_VERSION, planHash: stateHash(plan), plan, simulationVersion: variants[0]!.configuration.scenario.simulationVersion, variants, comparisons: variants.slice(1).map(v=>({ baseline: variants[0]!.id, variant: v.id, ...compareBatches(variants[0]!.runs,v.runs) })) };
  if (process.argv[3]) {
    writeFileSync(`${process.argv[3]}.json`, JSON.stringify(report,null,2)+'\n'); for (const variant of variants) writeFileSync(`${process.argv[3]}-${variant.id}.csv`, reportCsv(variant.runs));
    console.log(JSON.stringify({ output: process.argv[3], variants: variants.map(v=>({ id:v.id,...v.aggregate })) },null,2));
  } else console.log(JSON.stringify(report,null,2));
  if (variants.some(v=>v.aggregate.errors)) process.exitCode = 1;
} catch (error) { console.error(error instanceof Error ? error.message : 'Batch failed'); process.exitCode = 1; }
