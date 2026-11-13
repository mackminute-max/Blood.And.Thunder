/* global document */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5173'); await page.waitForFunction(() => document.documentElement.dataset.initializationReady === 'true');
  const output = async () => JSON.parse(await page.locator('#initial-state').innerText());
  await page.getByText('Edit scenario and content JSON', { exact: true }).click();
  const scenario = JSON.parse(await page.locator('#scenario-json').inputValue()); const content = JSON.parse(await page.locator('#content-json').inputValue());
  scenario.controller = 'fixture'; scenario.rules.disabledRemovalTicks = 2; content.drivers.find(driver => driver.id === 'driver-iron').currentHealth = 0;
  await page.locator('#scenario-json').fill(JSON.stringify(scenario)); await page.locator('#content-json').fill(JSON.stringify(content)); await page.locator('#engine-mode').selectOption('race');
  await page.getByRole('tab', { name: 'Environment', exact: true }).click();
  await page.locator('#environment-weather').selectOption('rain'); await page.locator('#environment-intensity').selectOption('disabled');
  const debris = { id: 'browser-debris', movementTick: 1, type: 'debris_spawn', tile: { segmentId: 'seg-02', lane: 0 }, durationTicks: 2 };
  await page.locator('#environment-plans-json').fill(JSON.stringify([{ ...debris, tile: { segmentId: 'seg-02', lane: 12 } }])); await page.locator('#apply-environment').click(); assert.match(await page.locator('#environment-feedback').innerText(), /Invalid hazard tile/);
  await page.locator('#environment-plans-json').fill(JSON.stringify([debris, { ...debris, id: 'browser-rough', type: 'track_roughness', tile: { segmentId: 'seg-03', lane: 0 } }])); await page.locator('#apply-environment').click(); assert.match(await page.locator('#environment-feedback').innerText(), /Validated/);
  assert.equal((await output()).state.activeWeatherId, 'clear');
  await page.locator('#initialize').click(); assert.equal((await output()).state.activeWeatherId, 'rain');
  await page.locator('#step-tick').click(); const first = await output(); assert.equal(first.state.hazards.length, 2); assert.ok(first.state.ruStates['ru-player'].teamFatigue > 0); assert.equal(first.state.ruStates['ru-iron'].wreckRemoved, false);
  assert.match(await page.locator('#environment-inspection').innerText(), /hazard_activated/); assert.match(await page.locator('#environment-inspection').innerText(), /Fresh/);
  await page.locator('#step-tick').click(); const two = await output(); assert.equal(two.state.ruStates['ru-iron'].wreckRemoved, true); assert.equal(two.state.ruStates['ru-iron'].driver.health, 0); assert.ok(two.events.some(event => event.type === 'wreck_removed'));
  await page.locator('#step-tick').click(); assert.equal((await output()).state.hazards.length, 0);
  await page.locator('#selected-tick').selectOption({ label: 'Tick 1' }); assert.match(await page.locator('#environment-inspection').innerText(), /hazard_activated/);
  await page.getByRole('tab', { name: 'Logs', exact: true }).click(); await page.locator('#filter-subsystem').fill('environment'); await page.locator('#filter-type').fill('wreck_removed'); assert.match(await page.locator('#log-count').innerText(), /1 matching/);
  const downloading = page.waitForEvent('download'); await page.locator('#export-latest').click(); const path = await (await downloading).path(); const bundle = JSON.parse(readFileSync(path, 'utf8')); assert.equal(bundle.state.tick, 3);
  const replay = JSON.parse(execFileSync(process.execPath, ['scripts/replay.ts', path], { encoding: 'utf8' })); assert.equal(replay.matchesExportedHash, true);
  await page.getByRole('tab', { name: 'RUs', exact: true }).click(); await page.locator('#asset-category').selectOption('tuningProfiles'); assert.equal(await page.locator('[data-field="environment.fatigue.basePerSecond"]').count(), 1); assert.equal(await page.locator('[data-field="environment.collision.avoidanceBase"]').count(), 1);
  assert.deepEqual(errors, []); console.log('C2 weather/incident draft validation, fatigue, activation/expiry, delayed wreck cleanup, history/filtering, numeric tuning and exported Node replay: PASS');
} finally { await browser.close(); }
