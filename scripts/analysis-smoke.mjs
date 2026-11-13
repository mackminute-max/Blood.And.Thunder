/* global document */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try {
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:5173');await page.waitForFunction(()=>document.documentElement.dataset.initializationReady==='true');
  const output=async()=>JSON.parse(await page.locator('#initial-state').innerText());const analysis=async()=>JSON.parse(await page.locator('#comparison-output').innerText());
  await page.locator('#step-tick').click();await page.locator('#step-tick').click();const live=await output();
  const downloading=page.waitForEvent('download');await page.locator('#export-latest').click();const diagnostic=JSON.parse(readFileSync(await(await downloading).path(),'utf8'));
  await page.getByRole('tab',{name:'Comparison',exact:true}).click();await page.locator('#comparison-current-a').click();await page.locator('#comparison-current-b').click();await page.locator('#comparison-run').click();await page.waitForFunction(()=>document.querySelector('#comparison-feedback').textContent.startsWith('Analysis complete'));
  assert.equal((await analysis()).comparison.identical,true);assert.equal((await analysis()).leftAudit.valid,true);assert.equal((await analysis()).rightAudit.valid,true);assert.equal((await output()).stateHash,live.stateHash);
  const altered=JSON.parse(JSON.stringify(diagnostic));altered.state.ruStates['ru-player'].speedMps=999;
  await page.locator('#comparison-file-b').setInputFiles({name:'altered.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(altered))});await page.locator('#comparison-run').click();await page.waitForFunction(()=>document.querySelector('#comparison-feedback').textContent.startsWith('Analysis complete'));assert.equal((await analysis()).rightAudit.valid,false);assert.ok((await analysis()).rightAudit.changedPaths.some(p=>p.path.endsWith('/speedMps')));
  altered.initialConfiguration.scenario.scriptedCommands.push({commandId:'e-ui-sign',type:'raiseSign',source:'player',effectiveTick:1,ruId:'ru-player',signId:'conserve'});await page.locator('#comparison-file-b').setInputFiles({name:'different-inputs.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(altered))});await page.locator('#comparison-run').click();await page.waitForFunction(()=>document.querySelector('#comparison-feedback').textContent.startsWith('Analysis complete'));assert.equal((await analysis()).comparison.firstDifference.leftTick,1);
  altered.initialConfiguration.scenario.simulationVersion='0.1.0';await page.locator('#comparison-file-b').setInputFiles({name:'old-version.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(altered))});await page.locator('#comparison-run').click();await page.waitForFunction(()=>document.querySelector('#comparison-feedback').textContent.startsWith('Analysis complete'));assert.equal((await analysis()).comparison.canonical,false);
  await page.locator('#comparison-file-b').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{}')});await page.locator('#comparison-run').click();await page.waitForFunction(()=>!document.querySelector('#comparison-feedback').textContent.startsWith('Re-executing'));assert.doesNotMatch(await page.locator('#comparison-feedback').innerText(),/^Analysis complete/);
  // Capture the same validated compact draft twice; analysis must leave the ongoing race intact.
  await page.getByRole('tab',{name:'Scenario',exact:true}).click();await page.getByText('Edit scenario and content JSON',{exact:true}).click();
  const compact=JSON.parse(readFileSync('src/content/scenarios/e-compact.scenario.json','utf8'));const content=JSON.parse(readFileSync('src/content/scenarios/e-compact.content.json','utf8'));compact.rules.maxTicks=2;
  await page.locator('#scenario-json').fill(JSON.stringify(compact));await page.locator('#content-json').fill(JSON.stringify(content));await page.getByRole('tab',{name:'Comparison',exact:true}).click();await page.locator('#comparison-draft-a').click();await page.locator('#comparison-draft-b').click();await page.locator('#comparison-seeds').fill('UI-E-1\nUI-E-2');await page.locator('#comparison-batch').click();await page.waitForFunction(()=>document.querySelector('#comparison-feedback').textContent.startsWith('Analysis complete'));
  const batch=await analysis();assert.equal(batch.variants[0].aggregate.races,2);assert.equal(batch.comparison.finishRateDelta.median,0);assert.equal((await output()).stateHash,live.stateHash);
  const exporting=page.waitForEvent('download');await page.locator('#comparison-export').click();const report=JSON.parse(readFileSync(await(await exporting).path(),'utf8'));assert.equal(report.variants[0].runs.length,2);
  await page.locator('#comparison-seeds').fill('duplicate\nduplicate');await page.locator('#comparison-batch').click();await page.waitForFunction(()=>document.querySelector('#comparison-feedback').textContent.includes('unique'));
  await page.locator('#comparison-cancel').click();assert.match(await page.locator('#comparison-feedback').innerText(),/canceled/);assert.deepEqual(errors,[]);
  console.log('E diagnostic import/audit, first divergence/paths, noncanonical versions, malformed input, worker paired batches, export/cancel and live-race isolation: PASS');
}finally{await browser.close();}
