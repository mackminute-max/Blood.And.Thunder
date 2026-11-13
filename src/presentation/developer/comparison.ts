import type { InitialConfiguration } from '../../contracts/initialization.ts';
import { validateSetup } from '../../configuration/validate.ts';
export function mountComparison(getBundle: ()=>string | undefined, getDraft: ()=>InitialConfiguration) {
  const get = (id:string)=>document.getElementById(id)!;
  const diagnostics: Record<string,string> = {}; const configs: Record<string,InitialConfiguration> = {}; let worker: Worker | null = null; let report: unknown;
  const feedback = get('comparison-feedback'); const output = get('comparison-output');
  const use = (slot:string,source:string) => { diagnostics[slot]=source; get(`comparison-${slot}-label`).textContent=`${slot.toUpperCase()}: diagnostic captured (${new Blob([source]).size} bytes)`; };
  for (const slot of ['a','b']) {
    get(`comparison-current-${slot}`).addEventListener('click',()=> { const source=getBundle(); if(source) use(slot,source); else feedback.textContent='Initialize a race first.'; });
    (get(`comparison-file-${slot}`) as HTMLInputElement).addEventListener('change',async()=> {
      const file=(get(`comparison-file-${slot}`) as HTMLInputElement).files?.[0]; if(!file)return;
      if(file.size>20*1024*1024) { feedback.textContent='Diagnostic exceeds 20 MiB';return; } try { use(slot,await file.text()); } catch { feedback.textContent='Could not read diagnostic file'; }
    });
    get(`comparison-draft-${slot}`).addEventListener('click',()=> { try { const input=getDraft(); configs[slot]=validateSetup(input.scenario,input.content); get(`comparison-draft-${slot}-label`).textContent=`Draft ${slot.toUpperCase()}: ${configs[slot].scenario.id} captured independently of live state`; } catch(error) { feedback.textContent=String(error); } });
  }
  const start = (message:unknown) => {
    worker?.terminate(); worker=new Worker(new URL('./analysis-worker.ts',import.meta.url),{type:'module'}); const activeWorker=worker; report=undefined; output.textContent=''; (get('comparison-export') as HTMLButtonElement).disabled=true; feedback.textContent='Re-executing isolated analysis…';
    worker.onmessage = (event:MessageEvent<{type:string;message?:string;result?:unknown}>)=> {
      if (worker !== activeWorker) return;
      if(event.data.type==='progress')feedback.textContent=event.data.message??'';
      if(event.data.type==='error') { feedback.textContent=event.data.message??'Analysis failed';worker?.terminate();worker=null; }
      if(event.data.type==='result') { report=event.data.result; const record=report as Record<string,unknown>; const summary='variants' in record ? { ...record, variants:(record.variants as {runs:unknown[]}[]).map(variant=>({...variant,runs:`${variant.runs.length} runs retained in export`})) }:report; output.textContent=JSON.stringify(summary,null,2); feedback.textContent='Analysis complete. The live race was unchanged.'; (get('comparison-export') as HTMLButtonElement).disabled=false;worker?.terminate();worker=null; }
    };
    worker.onerror=()=>{if(worker!==activeWorker)return;feedback.textContent='Analysis worker failed; live race was unchanged.';worker?.terminate();worker=null;}; worker.postMessage(message);
  };
  get('comparison-run').addEventListener('click',()=> { if(!diagnostics.a||!diagnostics.b) { feedback.textContent='Capture or import both diagnostic runs.';return; } start({type:'compare',left:diagnostics.a,right:diagnostics.b}); });
  get('comparison-batch').addEventListener('click',()=> { if(!configs.a||!configs.b) { feedback.textContent='Capture both configuration drafts.';return; } const seeds=(get('comparison-seeds') as HTMLTextAreaElement).value.split('\n').map(s=>s.trim()).filter(Boolean); start({type:'batch',configs:[configs.a,configs.b],seeds}); });
  get('comparison-cancel').addEventListener('click',()=> {worker?.terminate();worker=null;feedback.textContent='Analysis canceled. Live race unchanged.';});
  get('comparison-export').addEventListener('click',()=> { if(!report)return; const source=JSON.stringify(report,null,2); if(new Blob([source]).size>20*1024*1024) {feedback.textContent='Report exceeds 20 MiB; use fewer seeds or CLI output.';return;} const url=URL.createObjectURL(new Blob([source],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='blood-thunder-analysis.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),0); });
}
