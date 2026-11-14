/* global document */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5173'); await page.waitForFunction(() => document.documentElement.dataset.viewerReady === 'true' && document.documentElement.dataset.initializationReady === 'true');
  const output = async () => JSON.parse(await page.locator('#initial-state').innerText());
  await page.waitForFunction(() => document.querySelector('#viewer').dataset.markerCount === '6'); assert.equal(await page.locator('#live-standings tr').count(), 6); assert.match(await page.locator('#player-race-status').innerText(), /target.*fatigue/); assert.equal(await page.locator('#player-components li').count(), 4);
  await page.locator('#sign-choice').selectOption('conserve'); await page.locator('#raise-sign').click(); assert.equal((await output()).state.ruStates['ru-player'].activeSignId, null);
  await page.locator('#step-tick').click(); const first = await output(); assert.equal(first.state.ruStates['ru-player'].activeSignId, 'conserve'); assert.match(await page.locator('#sign-activation-notice').innerText(), /Activated conserve/);
  await page.waitForFunction(() => document.querySelector('#viewer').dataset.tick === '1' && document.querySelector('#viewer').dataset.interpolating === 'false');
  const positions = JSON.parse(await page.locator('#viewer').getAttribute('data-positions')); for (const [id, marker] of Object.entries(positions)) { assert.equal(marker.segmentId, first.state.ruStates[id].tile.segmentId); assert.equal(marker.lane, first.state.ruStates[id].tile.lane); assert.equal(marker.progress, first.state.ruStates[id].progressInSegment); }
  assert.match(await page.locator('#commentary-feed').innerText(), /under way/); assert.ok(JSON.parse(await page.locator('#commentary-feed li').first().getAttribute('data-source-ids')).length);
  const canvas = await page.locator('#viewer canvas').boundingBox(); const target = positions['ru-iron']; await page.mouse.click(canvas.x + target.x * canvas.width / 960, canvas.y + target.y * canvas.height / 500); await page.waitForFunction(() => document.querySelector('#race-selection').value === 'ru-iron', { timeout: 3000 });
  await page.locator('#race-selection').selectOption('ru-iron'); assert.match(await page.locator('#opponent-detail').innerText(), /perceived speed/); assert.doesNotMatch(await page.locator('#opponent-detail').innerText(), /HP|cooldown|intention|combatDecision/);
  await page.locator('#camera-mode').selectOption('follow'); await page.waitForFunction(() => document.querySelector('#viewer').dataset.cameraMode === 'follow'); assert.equal((await output()).stateHash, first.stateHash);
  await page.locator('#camera-mode').selectOption('full');
  await page.clock.install({ time: new Date('2026-11-13T08:00:00Z') }); await page.clock.pauseAt(new Date('2026-11-13T08:00:01Z'));
  await page.locator('#playback-speed').selectOption('4'); await page.locator('#play-pause').click(); await page.clock.runFor(150); await page.locator('#play-pause').click(); await page.clock.runFor(20); const accelerated = await output(); assert.equal(accelerated.state.tick, 4);
  const downloading = page.waitForEvent('download'); await page.locator('#export-latest').click(); const path = await (await downloading).path(); const replay = JSON.parse(execFileSync(process.execPath, ['scripts/replay.ts', path], { encoding: 'utf8' })); assert.equal(replay.matchesExportedHash, true);
  const exported = JSON.parse(readFileSync(path, 'utf8')); assert.equal(exported.state.tick, 4);
  // A real fatal event must appear in the radio and terminal stable report.
  await page.getByRole('tab', { name: 'Scenario', exact: true }).click(); await page.getByText('Edit scenario and content JSON', { exact: true }).click();
  const scenario = JSON.parse(await page.locator('#scenario-json').inputValue()); const content = JSON.parse(await page.locator('#content-json').inputValue());
  scenario.controller = 'fixture'; scenario.eventIntensity = 'disabled'; scenario.environmentPlans = [{ id: 'viewer-hazard', movementTick: 1, type: 'debris_spawn', tile: { segmentId: 'seg-04', lane: 0 }, durationTicks: 2 }]; scenario.rules.maxTicks = 2; scenario.scriptedCommands = []; scenario.combatPlans = [{ movementTick: 1, ruId: 'ru-player', targetRuId: 'ru-iron', weaponId: 'short-sword' }];
  const tuning = content.tuningProfiles[0]; tuning.combat.hitMin = 1; tuning.combat.hitMax = 1; tuning.environment.collision.enabled = false;
  const sword = content.weapons.find(w => w.id === 'short-sword'); sword.minDamage = 1000; sword.maxDamage = 1000; sword.eligibleTargets = ['driver']; sword.targetWeights = { driver: 1, chariot: 0, beast: 0 }; content.lethalityProfiles.find(p => p.id === scenario.lethalityProfileId).fatalityChance = 1;
  await page.locator('#scenario-json').fill(JSON.stringify(scenario)); await page.locator('#content-json').fill(JSON.stringify(content)); await page.locator('#initialize').click(); await page.locator('#step-tick').click(); await page.clock.runFor(20);
  assert.equal(await page.locator('#viewer').getAttribute('data-hazard-count'), '1');
  assert.match(await page.locator('#commentary-feed').innerText(), /fatality is confirmed/); assert.match(await page.locator('#commentary-feed').innerText(), /Iron is disabled/);
  await page.locator('#step-tick').click(); assert.equal(await page.locator('#race-results').isVisible(), true); assert.match(await page.locator('#condition-report').innerText(), /driver 0\/100 dead/); assert.match(await page.locator('#race-highlights').innerText(), /Iron is disabled/); assert.match(await page.locator('#result-heading').innerText(), /no eligible finisher/);
  scenario.combatPlans = []; scenario.rules.maxTicks = 10; scenario.rules.laps = 1; scenario.rules.combatAllowed = false; content.tracks[0].segments.forEach(segment => { segment.meters = .0005; });
  await page.locator('#scenario-json').fill(JSON.stringify(scenario)); await page.locator('#content-json').fill(JSON.stringify(content)); await page.locator('#initialize').click(); assert.equal(await page.locator('#race-results').isVisible(), false); assert.equal(await page.locator('#commentary-feed li').count(), 0);
  let result = await output(); for (let i = 0; i < 5 && result.state.phase !== 'complete'; i++) { await page.locator('#step-tick').click(); result = await output(); }
  assert.equal(result.state.phase, 'complete'); assert.ok(result.state.result.winnerIds.length); assert.match(await page.locator('#result-heading').innerText(), /Winner/); assert.match(await page.locator('#race-highlights').innerText(), /victory/);
  const liveTick = result.state.tick; await page.locator('#selected-tick').selectOption({ label: 'Tick 0' }); assert.match(await page.locator('#status').innerText(), new RegExp(`tick ${liveTick}`));
  await page.clock.runFor(20); await page.locator('h1').scrollIntoViewIfNeeded(); await page.screenshot({ path: '/tmp/blood-thunder-d-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 }); await page.clock.runFor(50); const width = await page.locator('#viewer').boundingBox(); assert.ok(width.width <= 390); await page.screenshot({ path: '/tmp/blood-thunder-d-mobile.png' });
  assert.deepEqual(errors, []); console.log('D authoritative markers/standings, privacy/selection/follow, paused signs, 4x playback/replay, factual radio, fatality/results/highlights, historical isolation and responsive layout: PASS');
} finally { await browser.close(); }
