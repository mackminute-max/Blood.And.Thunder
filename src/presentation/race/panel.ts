import type { DeepReadonly, InitialConfiguration } from '../../contracts/initialization.ts';
import { createCommentary } from '../commentary/generator.ts';
import { startViewer } from '../phaser/viewer.ts';
import { positionChanges, selectedDetail, standings } from './model.ts';
import type { ViewFrame } from './model.ts';
const get = (id: string) => document.getElementById(id)!;
const fixed = (value: number) => value.toFixed(2);
export function mountRacePresentation() {
  let config: DeepReadonly<InitialConfiguration> | null = null; let frame: ViewFrame | null = null; let previous: ViewFrame | null = null;
  let commentary: ReturnType<typeof createCommentary> | null = null; let selectedId: string | null = null; let follow = false; let lastPaint = -Infinity;
  const viewer = startViewer(id => { selectedId = id; refreshSelection(); });
  const choose = get('race-selection') as HTMLSelectElement;
  const redraw = (durationMs = 0) => { if (config && frame) viewer.update({ config, frame, previous, durationMs, selectedId, follow }); };
  const refreshSelection = () => {
    if (!config || !frame || !selectedId) return; choose.value = selectedId;
    const detail = selectedDetail(config, frame.state, selectedId);
    get('opponent-detail').textContent = detail.visibility === 'own' ? 'Your RU is selected; full condition appears in the player panel.' : detail.visibility === 'perceived' ? `${choose.selectedOptions[0]?.textContent}: perceived speed ${fixed(detail.observation!.speedMps)} m/s, lane ${detail.observation!.tile.lane + 1}, ${detail.observation!.status}.` : `${choose.selectedOptions[0]?.textContent}: outside player perception. Private attributes and intentions are not shown.`;
    redraw();
  };
  choose.addEventListener('change', () => { selectedId = choose.value; refreshSelection(); });
  get('camera-mode').addEventListener('change', () => { follow = (get('camera-mode') as HTMLSelectElement).value === 'follow'; redraw(); });
  const calls = (force: boolean) => {
    if (!commentary) return; const now = performance.now(); if (!force && now - lastPaint < 600) return; lastPaint = now;
    const feed = commentary.feed(); const list = get('commentary-feed'); list.replaceChildren();
    for (const call of feed.slice(-12)) {
      const line = document.createElement('li'); line.dataset.priority = call.priority; line.dataset.sourceIds = JSON.stringify(call.sourceIds); line.dataset.tick = String(call.tick); line.textContent = `T${call.tick} · ${call.text}`; list.append(line);
    }
    get('commentary-summary').textContent = `Showing ${Math.min(12, feed.length)} recent calls · ${commentary.summary().suppressed} routine repeats suppressed. Pause to read; full events remain in developer logs.`;
  };
  return {
    reset(initial: DeepReadonly<InitialConfiguration>, initialFrame: ViewFrame) {
      config = initial; commentary = createCommentary(initial); frame = null; previous = null; follow = false; lastPaint = -Infinity;
      (get('camera-mode') as HTMLSelectElement).value = 'full'; choose.replaceChildren(); for (const entry of initial.scenario.entries) choose.add(new Option(`${entry.name}${entry.isPlayer ? ' ★' : ''}`, entry.id)); selectedId = initial.scenario.entries.find(e => e.isPlayer)?.id ?? initial.scenario.entries[0]!.id;
      get('race-results').hidden = true; get('commentary-feed').replaceChildren(); get('race-highlights').replaceChildren(); this.frame(initialFrame, 0);
    },
    frame(next: ViewFrame, durationMs: number) {
      if (!config || !commentary) return;
      previous = frame; frame = next;
      commentary.append(next.state.tick, next.events, positionChanges(previous, next));
      const state = next.state; const dt = config.content.tuningProfiles.find(p => p.id === config!.scenario.tuningProfileId)!.tickDurationSeconds;
      get('status').textContent = `${'elapsedRaceTicks' in state ? 'Circuit race' : 'Movement harness'} · ${state.phase} · tick ${state.tick} · ${fixed(('elapsedRaceTicks' in state ? state.elapsedRaceTicks : state.tick) * dt)} s · ${config.content.weather.find(w => w.id === state.activeWeatherId)!.name}`;
      get('race-context').textContent = `${config.scenario.name} · ${config.scenario.rules.laps} laps · ${config.scenario.lethalityProfileId} · ${config.scenario.eventIntensity} external incidents`;
      const rows = get('live-standings'); rows.replaceChildren();
      for (const row of standings(config, state)) {
        const tr = document.createElement('tr'); for (const text of [String(row.officialRank ?? row.order), row.name, row.status, String(row.laps), fixed(row.progress), row.finishTime === null ? `${fixed(row.gapNcu)} NCU` : `${row.finishTime.toFixed(3)} s`]) { const td = document.createElement('td'); td.textContent = text; tr.append(td); } rows.append(tr);
      }
      get('standings-note').textContent = 'standings' in state ? 'Live order; official ranks appear on finishing. Gaps are normalized course units, not estimated seconds.' : 'Raw movement harness: official standings and results are unavailable. Select Circuit lifecycle to race.';
      const playerId = config.scenario.entries.find(e => e.isPlayer)?.id; const player = playerId ? state.ruStates[playerId] : undefined;
      get('player-race-status').textContent = player ? `${player.status} · ${fixed(player.speedMps)} / target ${fixed(player.targetSpeedMps)} m/s · fatigue ${fixed(player.teamFatigue)} · ${config.scenario.entries.find(e => e.id === playerId)!.preRaceStrategy} · ${player.aiDecision?.chosen.mode ?? 'fixture'} · sign ${player.activeSignId ?? 'none'}` : 'Headless scenario: no player RU.';
      const components = get('player-components'); components.replaceChildren();
      if (player) for (const component of [player.driver, player.chariot, ...player.beasts]) { const li = document.createElement('li'); li.textContent = `${component.kind}: ${component.id} — ${component.health}/${component.maxHealth} HP, ${component.band}${component.dead ? ', dead' : component.destroyed ? ', destroyed' : ''}`; components.append(li); }
      get('player-readiness').textContent = player ? `Combat readiness · ${Object.entries(player.cooldowns).map(([channel, ticks]) => `${channel}: ${ticks === 0 ? 'ready' : ticks + ' ticks'}`).join(' · ')}` : '';
      const result = 'result' in state ? state.result : null;
      get('race-results').hidden = !result;
      if (result) {
        get('result-heading').textContent = result.outcome === 'simulation_error' ? 'Race stopped — simulation error' : result.winnerIds.length ? `Winner${result.winnerIds.length > 1 ? 's (tie)' : ''}: ${result.winnerIds.map(id => config!.scenario.entries.find(e => e.id === id)!.name).join(' and ')}` : 'Race classified — no eligible finisher';
        const report = get('condition-report'); report.replaceChildren();
        for (const entry of result.classification) { const li = document.createElement('li'); li.textContent = `${config.scenario.entries.find(e => e.id === entry.ruId)!.name}: ${entry.status}${entry.reason ? ' (' + entry.reason.replaceAll('_', ' ') + ')' : ''}, ${entry.completedLaps} laps${entry.finishTimeSeconds !== null ? ', ' + entry.finishTimeSeconds.toFixed(3) + ' s' : ''}. ${entry.components.map(c => `${c.kind} ${c.health}/${c.maxHealth}${c.dead ? ' dead' : c.destroyed ? ' destroyed' : ''}${c.injuries.length ? ' injuries: ' + c.injuries.join(', ') : ''} [${c.id}]`).join('; ')}.`; report.append(li); }
        const highlights = get('race-highlights'); highlights.replaceChildren(); for (const call of commentary.highlights()) { const li = document.createElement('li'); li.dataset.sourceIds = JSON.stringify(call.sourceIds); li.textContent = `T${call.tick} · ${call.text}`; highlights.append(li); }
      }
      refreshSelection(); redraw(durationMs); calls(durationMs === 0 || Boolean(result) || next.events.some(e => ['ru_finished', 'ru_disabled', 'invariant_violation'].includes(e.type)));
    },
    pause() { redraw(); calls(true); },
    clear(message: string) { frame = null; previous = null; config = null; commentary = null; viewer.clear(); get('status').textContent = message; get('live-standings').replaceChildren(); get('player-race-status').textContent = ''; get('player-components').replaceChildren(); get('player-readiness').textContent = ''; get('commentary-feed').replaceChildren(); get('race-results').hidden = true; get('opponent-detail').textContent = ''; },
  };
}
