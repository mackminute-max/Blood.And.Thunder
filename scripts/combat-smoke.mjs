/* global document */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5173'); await page.waitForFunction(() => document.documentElement.dataset.initializationReady === 'true');
  const scenario = JSON.parse(await page.locator('#scenario-json').inputValue()); const content = JSON.parse(await page.locator('#content-json').inputValue());
  scenario.controller = 'fixture'; const t = content.tuningProfiles[0]; t.combat.hitMin = 1; t.combat.hitMax = 1;
  await page.getByText('Edit scenario and content JSON', { exact: true }).click();
  await page.locator('#scenario-json').fill(JSON.stringify(scenario)); await page.locator('#content-json').fill(JSON.stringify(content)); await page.locator('#initialize').click();
  await page.getByRole('tab', { name: 'Combat', exact: true }).click();
  const plan = { movementTick: 1, ruId: 'ru-player', targetRuId: 'ru-iron', weaponId: 'short-sword' };
  await page.locator('#combat-plans-json').fill(JSON.stringify([plan, plan])); await page.locator('#apply-combat-plans').click(); assert.match(await page.locator('#combat-plan-feedback').innerText(), /Duplicate/);
  await page.locator('#combat-plans-json').fill(JSON.stringify([plan])); await page.locator('#guard-plans-json').fill(JSON.stringify([{ movementTick: 1, ruId: 'ru-iron' }])); await page.locator('#apply-combat-plans').click(); assert.match(await page.locator('#combat-plan-feedback').innerText(), /Validated/);
  const output = async () => JSON.parse(await page.locator('#initial-state').innerText()); assert.equal((await output()).state.tick, 0);
  await page.locator('#initialize').click(); await page.locator('#step-tick').click(); const first = await output();
  assert.equal(first.state.phase, 'running'); assert.equal(first.state.ruStates['ru-player'].cooldowns.driver, 5); assert.equal(first.state.ruStates['ru-iron'].cooldowns.defense, 6);
  assert.ok(first.events.some(event => event.type === 'attack_hit')); assert.ok(first.events.some(event => event.type === 'component_damaged'));
  assert.match(await page.locator('#combat-inspection').innerText(), /attack_hit/); assert.match(await page.locator('#combat-inspection').innerText(), /candidates/);
  await page.locator('#step-tick').click(); assert.equal((await output()).state.ruStates['ru-player'].cooldowns.driver, 4);
  await page.locator('#selected-tick').selectOption({ label: 'Tick 1' }); assert.match(await page.locator('#combat-inspection').innerText(), /component_damaged/);
  await page.getByRole('tab', { name: 'Logs', exact: true }).click(); await page.locator('#filter-subsystem').fill('combat'); await page.locator('#filter-type').fill('attack_hit'); assert.match(await page.locator('#log-count').innerText(), /1 matching/);
  const downloading = page.waitForEvent('download'); await page.locator('#export-latest').click(); const path = await (await downloading).path(); const bundle = JSON.parse(readFileSync(path, 'utf8')); assert.equal(bundle.state.tick, 2);
  const replay = JSON.parse(execFileSync(process.execPath, ['scripts/replay.ts', path], { encoding: 'utf8' })); assert.equal(replay.matchesExportedHash, true); assert.deepEqual(errors, []);
  console.log('C1 combat fixture validation, guard, damage/readiness, selected tick, combat filtering and exported Node replay: PASS');
} finally { await browser.close(); }
