/* global document */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5173'); await page.waitForFunction(() => document.documentElement.dataset.initializationReady === 'true');
  const output = async () => JSON.parse(await page.locator('#initial-state').innerText());
  const tab = async name => page.getByRole('tab', { name, exact: true }).click();
  await page.getByText('Edit scenario and content JSON', { exact: true }).click();
  const scenario = JSON.parse(await page.locator('#scenario-json').inputValue());
  scenario.controller = 'fixture';
  scenario.entries = scenario.entries.filter(entry => entry.id === 'ru-player');
  scenario.startingGrid = { 'ru-player': { segmentId: 'seg-00', lane: 0 } };
  scenario.gridRows = [{ id: 'front', segmentId: 'seg-00', ruIds: ['ru-player'] }];
  scenario.targetSpeedRatios = { 'ru-player': 0 }; scenario.rules.allowStationaryLaneChange = true;
  await page.locator('#scenario-json').fill(JSON.stringify(scenario)); await page.locator('#preview-draft').click();
  await tab('Movement'); await page.locator('#maneuver-ru').selectOption('ru-player');
  await page.locator('#maneuver-tick').fill('1'); await page.locator('#maneuver-delta').selectOption('1'); await page.locator('#add-maneuver').click();
  assert.equal(JSON.parse(await page.locator('#maneuver-plans').innerText()).length, 1);
  assert.equal(Object.keys((await output()).state.ruStates).length, 6); // Draft isolated.
  await page.locator('#add-maneuver').click(); assert.match(await page.locator('#setup-feedback').innerText(), /scenario.maneuvers/);
  await page.locator('#initialize').click(); await page.locator('#step-tick').click();
  const success = await output(); assert.equal(success.state.ruStates['ru-player'].tile.lane, 1);
  const lane = success.events.find(event => event.type === 'lane_change_resolved'); assert.equal(lane.accepted, true); assert.equal(lane.roll, null); assert.equal(lane.speedBefore, lane.speedAfter);
  assert.match(await page.locator('#movement-inspection').innerText(), /lane_change_resolved/);
  await tab('Logs'); await page.locator('#filter-subsystem').fill('movement'); await page.locator('#filter-type').fill('lane_change_resolved');
  assert.equal(await page.locator('.log-row').count(), 1); await page.locator('.log-row').click(); assert.match(await page.locator('#log-detail').innerText(), /"accepted": true/);
  await tab('Scenario');
  const downloading = page.waitForEvent('download'); await page.locator('#export-configuration').click();
  const exported = JSON.parse(readFileSync(await (await downloading).path(), 'utf8'));
  assert.deepEqual(exported.scenario.maneuvers, [{ movementTick: 1, ruId: 'ru-player', laneDelta: 1, abortIfBlocked: false }]);
  const content = JSON.parse(await page.locator('#content-json').inputValue());
  content.tracks[0].segments[0].lanes[1].traction = .5;
  content.tuningProfiles[0].movement.handling.minProbability = 0; content.tuningProfiles[0].movement.handling.maxProbability = 0;
  await page.locator('#content-json').fill(JSON.stringify(content)); await page.locator('#initialize').click(); await page.locator('#step-tick').click();
  const failed = await output(); assert.equal(failed.state.ruStates['ru-player'].tile.lane, 0);
  assert.equal(failed.events.find(event => event.type === 'lane_change_resolved').reason, 'handling_failure');
  assert.deepEqual(errors, []);
  console.log('B1 planned maneuvers, draft isolation, duplicate rejection, routine success, seeded failure, movement inspector/filter and configuration export: PASS');
} finally { await browser.close(); }
