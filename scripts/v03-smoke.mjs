/* global document */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:5173');
  await page.waitForFunction(()=>document.documentElement.dataset.initializationReady==='true');
  const output=async()=>JSON.parse(await page.locator('#initial-state').innerText());
  await page.getByRole('tab',{name:'Rules',exact:true}).click();await page.locator('#competition-style').selectOption('pure');
  await page.locator('#initialize').click();assert.match(await page.locator('#race-context').innerText(),/Pure Racing/);
  await page.locator('#sign-choice').selectOption('attack');await page.locator('#raise-sign').click();
  assert.match(await page.locator('#command-feedback').innerText(),/incompatible/);assert.equal((await output()).state.ruStates['ru-player'].signOpportunitiesRemaining,3);
  await page.locator('#step-tick').click();assert.equal((await output()).state.ruStates['ru-player'].combatStats.attempts,0);
  const liveBefore=await output();
  await page.getByRole('tab',{name:'RUs',exact:true}).click();
  await page.locator('#bulk-field').selectOption('beasts.speed');await page.locator('#bulk-value').fill('85');await page.locator('#bulk-preview').click();
  const changes=JSON.parse(await page.locator('#bulk-changes').innerText());assert.equal(new Set(changes.map(c=>c.ruId)).size,6);assert.equal(changes.length,12);
  await page.locator('#bulk-apply').click();const bulkContent=JSON.parse(await page.locator('#content-json').inputValue());
  assert.ok(bulkContent.beasts.every(b=>b.speed===85));assert.deepEqual(await output(),liveBefore);
  await page.locator('#bulk-undo').click();assert.ok(JSON.parse(await page.locator('#content-json').inputValue()).beasts.some(b=>b.speed!==85));
  await page.locator('#bulk-value').fill('101');await page.locator('#bulk-preview').click();assert.equal(await page.locator('#bulk-apply').isDisabled(),true);assert.deepEqual(await output(),liveBefore);
  await page.locator('[data-field="globalStrength"]').fill('3');await page.locator('[data-field="globalStrength"]').press('Tab');
  assert.match(await page.locator('#sign-effective').innerText(),/"effectiveMultiplier": 3/);
  await page.getByRole('button',{name:'Reset globalStrength',exact:true}).click();
  assert.deepEqual(errors,[]);console.log('v0.3 rulesets, atomic all-RU preview/apply/restore/reject, sign tuning and live isolation: PASS');
} finally {await browser.close();}
