import { assertBatchWorkload } from '../../configuration/workload.ts';
import { compareDiagnosticSources } from '../../diagnostics/compare.ts';
import { runMeasuredRace, aggregate, compareBatches, REPORT_VERSION } from '../../diagnostics/batch.ts';
import { validateSetup } from '../../configuration/validate.ts';
import type { InitialConfiguration } from '../../contracts/initialization.ts';
import { stateHash } from '../../diagnostics/state-hash.ts';
type Request = { type: 'compare'; left: string; right: string } | { type: 'batch'; configs: InitialConfiguration[]; seeds: string[] };
self.onmessage = (event: MessageEvent<Request>) => {
  try {
    const request = event.data;
    if (request.type === 'compare') {
      const comparison = compareDiagnosticSources(request.left,request.right);
      self.postMessage({ type:'result', result: 'captureAudits' in comparison ? { comparison, leftAudit: comparison.captureAudits.left, rightAudit: comparison.captureAudits.right } : { comparison } });
    } else {
      if (!request.seeds.length || request.seeds.length > 100 || new Set(request.seeds).size !== request.seeds.length || request.seeds.some(seed=>!seed.trim()) || request.configs.length !== 2) throw new Error('Choose two drafts and 1–100 unique nonblank seeds');
      const validated = request.configs.map(input=>validateSetup(input.scenario,input.content));
      assertBatchWorkload(validated,request.seeds.length);
      const variants = validated.map((input,index)=> {
        const config = validateSetup(input.scenario,input.content); const runs = [];
        for (const seed of request.seeds) { runs.push(runMeasuredRace({ ...config.scenario,seed },config.content)); self.postMessage({ type:'progress', message:`Draft ${index===0?'A':'B'}: ${runs.length}/${request.seeds.length}` }); }
        return { id: index===0?'A':'B', configuration: config, configurationHash: stateHash(config), seeds: request.seeds, aggregate: aggregate(runs), runs };
      });
      self.postMessage({ type:'result', result:{ kind:REPORT_VERSION, variants, comparison:compareBatches(variants[0]!.runs,variants[1]!.runs) } });
    }
  } catch (error) { self.postMessage({ type:'error', message:error instanceof Error?error.message:'Analysis failed' }); }
};
