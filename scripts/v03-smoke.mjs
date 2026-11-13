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
  assert.deepEqual(errors,[]);console.log('v0.3 ruleset selector, Pure action/sign enforcement and browser startup: PASS');
} finally {await browser.close();}
